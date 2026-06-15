#!/usr/bin/env python
"""Offline fitter for the persona measurement matrix W — WI-2 (§9.2).

NOT in the request path. Fits a Factor Analysis model φ = L z + μ + ε (ε~N(0,diag Ψ)) by EM
over a corpus of language-independent feature vectors (persona.featurize_raw), then resolves
FA's rotation indeterminacy by **semi-supervised anchoring**: a regularized linear alignment
of the FA latent to the 8 named persona axes using curated labels. Writes the committed
artifact services/ml/echo_ml/artifacts/measurement.npz consumed by persona_model.load().

Idempotent and seeded — re-running with the same args reproduces the same artifact.

Anchor format (`--anchors anchors.jsonl`, one JSON object per line):

    {"text": "Hey, thanks so much — that means a lot!",
     "telemetry": {"latencyMs": 600, "editsCount": 0},
     "axes": {"warmth": 0.8, "affect": 0.6, "pace": 0.4}}

`text` (+ optional `telemetry`) is featurized exactly as at runtime; `axes` is a partial
Big-Five-style / curated persona self-report mapped onto the named axes (missing axes → 0).
A few hundred such rows pin the latent to the named directions. When no anchors file is
given, a deterministic synthetic corpus is generated and the legacy heuristic featurizer
(persona.featurize) supplies the anchor labels — a faithful, language-independent bootstrap
of the original hand-mapped behaviour.

Usage:
    ./.venv/bin/python scripts/train_measurement.py                # synthetic bootstrap
    ./.venv/bin/python scripts/train_measurement.py --anchors anchors.jsonl --n 1200
"""
from __future__ import annotations

import argparse
import json
import sys
import warnings
from pathlib import Path

import numpy as np

# Make `echo_ml` importable when run from services/ml.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from echo_ml import persona as P
from echo_ml.persona_axes import AXIS_KEYS, AXIS_INDEX
from echo_ml.persona_model import PersonaModel, fa_em, anchor_alignment, ARTIFACT_PATH

warnings.filterwarnings("ignore", message=".*encountered in matmul.*")

# ── synthetic anchor corpus ───────────────────────────────────────────────────────
# Style fragments chosen so the legacy heuristic featurizer produces varied, valid axis
# labels (it is English-tuned). The LEARNED W generalizes these to any language through the
# language-agnostic stylometry + multilingual-embedding features — that is the whole point.
_WARM = ["Hey, thanks so much, you are wonderful!", "Hi! So glad to hear from you, love it.",
         "Nice — really appreciate you, thank you."]
_COLD = ["No.", "Fine.", "Whatever works.", "Not interested."]
_OPEN = ["What do you think? Why is that?", "Curious — how would you see it?",
         "Interesting, what if we tried something odd?"]
_FORMAL = ["I would be grateful for your consideration of this matter.",
           "Please find the requested information enclosed herewith."]
_CASUAL = ["lol haha u gonna come or nah", "idk man, gonna chill prob"]
_ASSERT = ["Do it now.", "We ship today. Period.", "Make the call."]
_HEDGE = ["maybe i think we could perhaps try, i guess", "sort of, i guess, perhaps later"]
_CEREBRAL = ["The epistemological ramifications warrant considerable deliberation.",
             "Fundamentally, the architecture necessitates rigorous reconsideration."]
_PLAYFUL = ["haha yep totally", "lol ok sure why not"]
_BANK = _WARM + _COLD + _OPEN + _FORMAL + _CASUAL + _ASSERT + _HEDGE + _CEREBRAL + _PLAYFUL


def synthetic_corpus(n: int, seed: int):
    """Return (texts, telemetries, Z_target) — Z_target are heuristic axis labels in [-1,1]^D.
    Latency is varied widely so the latency→pace relationship is well represented."""
    rng = np.random.default_rng(seed)
    texts, teles, targets = [], [], []
    for _ in range(n):
        text = str(rng.choice(_BANK))
        if rng.random() < 0.5:  # sometimes append a second fragment for length variety
            text = text + " " + str(rng.choice(_BANK))
        lat = int(rng.choice([150, 300, 600, 1200, 2500, 4000, 6000]))
        edits = int(rng.integers(0, 4))
        tele = {"latencyMs": lat, "editsCount": edits}
        if rng.random() < 0.2:
            tele["approach"] = bool(rng.random() < 0.5)
        if rng.random() < 0.12:        # some telemetry-only rows (empty text)
            text = ""
        y, mask, _ = P.featurize(text, tele)
        targets.append(y)              # heuristic evidence (0 where unobserved) as the anchor
        texts.append(text)
        teles.append(tele)
    return texts, teles, np.array(targets, dtype=float)


def load_anchor_corpus(path: Path):
    texts, teles, targets = [], [], []
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        row = json.loads(line)
        texts.append(row.get("text", ""))
        teles.append(row.get("telemetry", {}))
        z = np.zeros(len(AXIS_KEYS))
        for k, v in (row.get("axes", {}) or {}).items():
            if k in AXIS_INDEX:
                z[AXIS_INDEX[k]] = float(np.clip(v, -1, 1))
        targets.append(z)
    return texts, teles, np.array(targets, dtype=float)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--anchors", type=str, default="")
    ap.add_argument("--n", type=int, default=900)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--iters", type=int, default=200)
    ap.add_argument("--out", type=str, default=str(ARTIFACT_PATH))
    args = ap.parse_args()

    if args.anchors:
        texts, teles, Z = load_anchor_corpus(Path(args.anchors))
    else:
        texts, teles, Z = synthetic_corpus(args.n, args.seed)

    Phi = np.array([P.featurize_raw(t, tl) for t, tl in zip(texts, teles)], dtype=float)
    print(f"[train] corpus: N={Phi.shape[0]}  F={Phi.shape[1]}  D={len(AXIS_KEYS)}")

    # FA EM models the feature covariance and gives the monotone EM lower bound (a sanity
    # check that the feature space is well-behaved); the deployed loading is the anchored
    # read-out below.
    mu = Phi.mean(axis=0)
    _, _, _, lls = fa_em(Phi, K=len(AXIS_KEYS), iters=args.iters, seed=args.seed)
    print(f"[train] FA EM: {len(lls)} iters, LL {lls[0]:.1f} → {lls[-1]:.1f} "
          f"(monotone={bool(np.all(np.diff(lls) > -1e-6))})")

    # Semi-supervised anchoring: ridge-regress the centered features on the named axes.
    W, Psi = anchor_alignment(Phi - mu, Z, ridge=1.0)   # (D, F) loading, (F,) residual noise
    print(f"[train] anchored W: shape {W.shape}, ‖W‖={np.linalg.norm(W):.2f}")

    model = PersonaModel(W=W, mu_phi=mu, Psi=Psi,
                         feature_names=P.feature_names(), axis_keys=list(AXIS_KEYS))
    model.save(Path(args.out))
    print(f"[train] wrote {args.out}")

    # Quick self-check: top features per axis (the interpretability trace).
    interp = model.interpretability(top=3)
    for axis in ("warmth", "pace", "formality"):
        tops = ", ".join(f"{f['feature']}{f['loading']:+.2f}" for f in interp[axis])
        print(f"[train]   {axis:10s} ← {tops}")


if __name__ == "__main__":
    main()
