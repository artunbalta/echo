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
from echo_ml.config import HYPER
from echo_ml.persona_axes import AXIS_KEYS, AXIS_INDEX
from echo_ml.persona_model import (
    PersonaModel, fa_em, anchor_alignment, fit_state_factors, ARTIFACT_PATH,
)

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


def behavioral_corpus(n: int, seed: int):
    """Return (texts, telemetries, Z_target) anchoring the §3.2 BEHAVIORAL features to the
    persona axes — the Phase 0 spine. Each row is a telemetry-only "choice" (empty text) whose
    behavioral signals map onto axes per the §3.3/D4 *semantic remap* (axes kept; meaning moved
    via these anchors, not renames): save-rate→−pace (future-orientation), risk→+dominance,
    persistence→+formality (conscientiousness), pet-attach→+warmth/+affect, solitude-tol→
    −energy/−warmth (social need), time-share social→+warmth / learn→+intellect / build→
    +dominance / leisure→−energy, deliberate latency→−pace/+intellect. A few hundred rows pin
    W's new columns to the named directions, so a played day moves the right traits."""
    rng = np.random.default_rng(seed + 101)
    teles, targets = [], []
    iz = AXIS_INDEX
    for _ in range(n):
        z = np.zeros(len(AXIS_KEYS))
        tele: dict = {}

        sr = float(rng.random()); tele["save_rate"] = sr
        z[iz["pace"]] += -(sr - 0.5) * 1.4                     # save ⇒ unhurried, future-oriented

        ri = float(rng.random()); tele["risk_index"] = ri
        z[iz["dominance"]] += (ri - 0.5) * 1.2                 # risk-taking ⇒ assertive

        pe = float(rng.random()); tele["persistence"] = pe
        z[iz["formality"]] += (pe - 0.5) * 1.2                 # follow-through ⇒ conscientious

        alloc = rng.dirichlet(np.ones(5))
        for k, v in zip(["ts_earn", "ts_learn", "ts_social", "ts_leisure", "ts_build"], alloc):
            tele[k] = float(v)
        z[iz["warmth"]] += (alloc[2] - 0.2) * 1.0              # social hours ⇒ warm/affiliative
        z[iz["intellect"]] += (alloc[1] - 0.2) * 1.0          # study hours ⇒ cerebral
        z[iz["dominance"]] += (alloc[4] - 0.2) * 0.6          # build hours ⇒ achievement
        z[iz["energy"]] += -(alloc[3] - 0.2) * 0.8            # leisure hours ⇒ calm

        st = float(rng.random()); tele["solitude_tol"] = st
        z[iz["energy"]] += -(st - 0.5) * 0.8                  # comfortable alone ⇒ lower social energy
        z[iz["warmth"]] += -(st - 0.5) * 0.5

        pa = float(rng.random()); tele["pet_attach"] = pa
        z[iz["warmth"]] += (pa - 0.5) * 0.8                   # attachment ⇒ warm
        z[iz["affect"]] += (pa - 0.5) * 0.6                   # and expressive

        dl = int(rng.choice([200, 800, 2000, 5000])); tele["decision_latency"] = dl
        delib = float(np.tanh(dl / 3000.0))
        z[iz["pace"]] += -(delib - 0.4) * 0.6                 # deliberate ⇒ unhurried
        z[iz["intellect"]] += (delib - 0.4) * 0.4

        teles.append(tele)
        targets.append(np.clip(z, -1, 1))
    return [""] * n, teles, np.array(targets, dtype=float)


def openness_corpus(n: int, seed: int):
    """★ P5 (known-gaps #1/#3): anchor the NEW openness feature block so exploration finally has
    its own identified direction — the eigenvalue the information matrix was missing (IV.4).
    Each row draws the four novelty features INDEPENDENTLY of the social/economic draws, so
    openness decorrelates from warmth/dominance in the anchor corpus (that independence is what
    breaks the factor degeneracy). Doc priors: novelty breadth → openness(+, strong) with a mild
    energy(+); wander → openness(+) with a mild pace(−); far/bare travel → openness(+, strong);
    curiosity acts (unmarked paths, eggs, questions, deviation) → openness(+, strong) with a
    mild intellect(+)."""
    rng = np.random.default_rng(seed + 202)
    iz = AXIS_INDEX
    teles, targets = [], []
    for _ in range(n):
        z = np.zeros(len(AXIS_KEYS))
        tele: dict = {}

        # Axis-NEUTRAL latency on half the rows: keeps has_latency/latency_norm decorrelated
        # from "is a text row" so the reply-tempo features stay pinned to pace, not to the
        # text rows' style labels (a corpus-composition artifact, not a real relationship).
        if rng.random() < 0.5:
            tele["latencyMs"] = int(rng.choice([150, 300, 600, 1200, 2500, 4000, 6000]))
            z[iz["pace"]] += float(np.tanh((1500.0 - tele["latencyMs"]) / 1500.0)) * 0.5

        nv = float(rng.random()); tele["novel_tile_ratio"] = nv
        z[iz["openness"]] += (nv - 0.4) * 1.5                 # new ground per minute ⇒ explorer
        z[iz["energy"]] += (nv - 0.5) * 0.3

        pt_raw = float(1.0 + rng.random() * 6.0); tele["path_tortuosity"] = pt_raw
        wander = float(np.tanh((pt_raw - 1.0) / 2.5))
        z[iz["openness"]] += (wander - 0.4) * 0.7             # meandering ⇒ curiosity-led
        z[iz["pace"]] += -(wander - 0.5) * 0.3                # and unhurried

        tn = float(rng.random()); tele["travel_novelty"] = tn
        z[iz["openness"]] += (tn - 0.4) * 1.3                 # sails to far/bare shores ⇒ novelty

        cu = float(rng.random()); tele["curiosity"] = cu
        z[iz["openness"]] += (cu - 0.4) * 1.4                 # unmarked paths / eggs / questions
        z[iz["intellect"]] += (cu - 0.5) * 0.3

        teles.append(tele)
        targets.append(np.clip(z, -1, 1))
    return [""] * n, teles, np.array(targets, dtype=float)


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
    ap.add_argument("--k-state", type=int, default=HYPER.k_state)
    ap.add_argument("--out", type=str, default=str(ARTIFACT_PATH))
    args = ap.parse_args()

    if args.anchors:
        texts, teles, Z = load_anchor_corpus(Path(args.anchors))
    else:
        # Default keyless bootstrap: synthetic TEXT rows anchor the style/embedding features
        # (legacy behaviour, preserved), behavioral rows anchor the §3.2 choice features
        # (the Phase 0 spine), and — since the ★ P5 re-anchor — openness rows anchor the
        # exploration block (the full multi-flow cue set: F0 exploration + F2/F3 dialogue +
        # travel). One fit pins all three halves of the grown W.
        t_s, tl_s, Z_s = synthetic_corpus(args.n, args.seed)
        t_b, tl_b, Z_b = behavioral_corpus(max(1, args.n // 2), args.seed)
        t_o, tl_o, Z_o = openness_corpus(max(1, args.n // 2), args.seed)
        texts, teles, Z = t_s + t_b + t_o, tl_s + tl_b + tl_o, np.vstack([Z_s, Z_b, Z_o])

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

    # Trait/state split (WI-5): the top-k structured directions of the trait residual are the
    # transient state V (marginalized into the measurement covariance); the rest is iid Ψ.
    V = Sigma_m = None
    if args.k_state > 0:
        V, Sigma_m, Psi = fit_state_factors((Phi - mu) - Z @ W, args.k_state)
        print(f"[train] state factors: V{V.shape}, Σ_m={np.round(Sigma_m, 3)}")

    model = PersonaModel(W=W, mu_phi=mu, Psi=Psi, V=V, Sigma_m=Sigma_m,
                         feature_names=P.feature_names(), axis_keys=list(AXIS_KEYS))
    model.save(Path(args.out))
    print(f"[train] wrote {args.out}")

    # Quick self-check: top features per axis (the interpretability trace).
    interp = model.interpretability(top=3)
    for axis in ("warmth", "pace", "formality", "openness"):
        tops = ", ".join(f"{f['feature']}{f['loading']:+.2f}" for f in interp[axis])
        print(f"[train]   {axis:10s} ← {tops}")

    # ★ Identifiability diagnostic (blueprint IV.4 / IX.3): the Fisher information the feature
    # space carries about each axis, I = W Ψ⁻¹ Wᵀ. An axis with near-zero information is
    # UNIDENTIFIED (its variance leaks into the others) — exactly what openness was before the
    # re-anchor. Report per-axis information + the matrix condition number.
    info = W @ np.diag(1.0 / np.maximum(Psi, 1e-6)) @ W.T
    eigs = np.linalg.eigvalsh(info)
    print(f"[train] information I=WΨ⁻¹Wᵀ: cond={eigs[-1] / max(eigs[0], 1e-12):.1f}  min-eig={eigs[0]:.3f}")
    for i, k in enumerate(AXIS_KEYS):
        print(f"[train]   I[{k:10s}] = {info[i, i]:8.3f}")


if __name__ == "__main__":
    main()
