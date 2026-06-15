"""FastAPI surface for the learning engine. Wires the online loop of §9.8.

Endpoints (all except /health require Authorization: Bearer ML_SERVICE_TOKEN):
  POST /observe          a user action → update persona, behavior index, autonomy stats
  POST /telemetry        an implicit signal → persona update (revealed preference)
  POST /npc/turn         NPC dialogue (called by the realtime server)
  POST /agent/turn       agent acting on the user's behalf → policy + gate decision
  POST /feedback         human approve/edit/reject of an agent action → labels everything
  POST /meeting-outcome  ground-truth outcome → supervised reward anchor
  GET  /persona/{uid}    inspect posterior, traits, buckets, calibration (observability)
  POST /select-npc       BALD active-learning NPC selection
  DELETE /user/{uid}     hard delete all derived state (§13)
"""
from __future__ import annotations

from typing import Optional

import numpy as np
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import SETTINGS
from .store import STORE, BehaviorEntry
from .embeddings import embed
from . import persona as P
from . import gate as G
from .bald import bald_scores
from .policy import generate
from .llm import complete
from .autonomy import persona_drift_kl
from .persona_axes import AXIS_KEYS
from .cost import METER

app = FastAPI(title="ECHO ML", version="0.1.0")

# Global observability counters (§14).
METRICS = {"autonomy_changes": 0, "drift_events": 0, "promotions": 0, "feedback": 0}
_LEVELS = ["copilot", "supervised", "auto"]


def _top_correlation(post: P.Posterior) -> Optional[dict]:
    """Most strongly correlated off-diagonal axis pair, for the EchoPanel transparency
    trace (inspectability invariant): which two traits the model now sees as co-moving."""
    Sigma = post.Sigma
    d = np.sqrt(np.clip(np.diag(Sigma), 1e-12, None))
    corr = Sigma / np.outer(d, d)
    best, bi, bj = 0.0, -1, -1
    for i in range(P.D):
        for j in range(i + 1, P.D):
            if abs(corr[i, j]) > abs(best):
                best, bi, bj = corr[i, j], i, j
    if bi < 0:
        return None
    return {"axes": [AXIS_KEYS[bi], AXIS_KEYS[bj]], "rho": round(float(best), 3)}


def _auth(authorization: str | None):
    token = (authorization or "").removeprefix("Bearer ").strip()
    if token != SETTINGS.ml_token:
        raise HTTPException(status_code=401, detail="bad ML token")


# ── models ────────────────────────────────────────────────────────────────────
class ObserveReq(BaseModel):
    userId: str
    context: dict = {}
    action: str = ""
    telemetry: dict = {}


class TelemetryReq(BaseModel):
    userId: str
    sessionId: Optional[str] = None
    event: dict


class NpcTurnReq(BaseModel):
    npc: dict
    history: list[dict]
    sustained: bool = False


class AgentTurnReq(BaseModel):
    userId: str
    context: str = ""
    userMessage: str = ""
    bucket: str = "smalltalk"
    stakes: str = "low"


class FeedbackReq(BaseModel):
    userId: str
    bucket: str = "smalltalk"
    confidence: float = 0.5
    agreed: bool = True
    chosen: Optional[str] = None
    rejected: Optional[str] = None
    context: str = ""


class OutcomeReq(BaseModel):
    userId: str
    counterpartId: str
    action: str = ""
    context: str = ""
    occurred: bool = True
    rating: Optional[int] = None


class SelectNpcReq(BaseModel):
    userId: str
    npcs: list[dict]  # [{id, axes_vec:[8]}]
    samples: int = 256


# ── health ──────────────────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"ok": True, "service": "echo-ml", "users": len(STORE.all_user_ids())}


# ── online loop: observe a user action (§9.8) ────────────────────────────────────
@app.post("/observe")
def observe(req: ObserveReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)
    ctx = str(req.context)

    # 1) update persona posterior from text + telemetry
    before = st.posterior.copy()
    st.posterior = P.observe(st.posterior, req.action, req.telemetry)
    if st.baseline_mu is None:
        st.baseline_mu = st.posterior.mu.copy()

    # 2) behavior index (embed (s,a), store) for retrieval (§9.3) — index side ⇒ "document"
    emb = embed(f"{ctx} || {req.action}", input_type="document")
    st.behaviors.append(BehaviorEntry(emb, req.action, ctx))
    st.behaviors = st.behaviors[-500:]

    # 3) drift check (§9.7): recent vs baseline, full-covariance KL
    drift_kl = persona_drift_kl(st.posterior.mu, st.baseline_mu, st.posterior.Sigma,
                                np.eye(P.D) * P.HYPER.prior_var)
    if drift_kl > P.HYPER.drift_kl_threshold:
        st.posterior = P.inflate(st.posterior, factor=1.5)
        st.baseline_mu = st.posterior.mu.copy()

    return {
        "persona": st.posterior.to_dict(),
        "traits": P.decode_traits(st.posterior),
        "var": st.posterior.var.tolist(),
        "correlation": _top_correlation(st.posterior),
        "uncertainty": float(np.mean(st.posterior.var)),
        "behaviors": len(st.behaviors),
        "drift_kl": round(drift_kl, 3),
    }


@app.post("/telemetry")
def telemetry(req: TelemetryReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)
    ev = req.event or {}
    t = ev.get("type")
    payload = ev.get("payload", {})
    # Map implicit signals to persona evidence (approach/avoid → warmth/dominance, etc.).
    tele = {}
    if t == "approach":
        tele["approach"] = True
    elif t == "avoid":
        tele["approach"] = False
    elif t == "reply_latency":
        tele["latencyMs"] = payload.get("ms")
        tele["editsCount"] = payload.get("edits")
    if tele:
        st.posterior = P.observe(st.posterior, "", tele)
    return {"ok": True, "uncertainty": float(np.mean(st.posterior.var))}


# ── NPC dialogue (called by realtime) ────────────────────────────────────────────
@app.post("/npc/turn")
def npc_turn(req: NpcTurnReq, authorization: str = Header(None)):
    _auth(authorization)
    system = req.npc.get("systemPrompt", "You are a resident of a strange country.")
    model = SETTINGS.model_strong if req.sustained else SETTINGS.model_cheap
    msgs = [{"role": h["role"], "content": h["text"]} for h in req.history]
    text = complete(system, msgs, model=model, max_tokens=160, n=1)[0]
    return {"text": text}


# ── agent acting on the user's behalf (§9.3 + §9.5) ──────────────────────────────
@app.post("/agent/turn")
def agent_turn(req: AgentTurnReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)
    query = embed(f"{req.context} || {req.userMessage}", input_type="query")
    retrieved = st.retrieve(query, k=5)
    pol = generate(st.posterior, st.reward, req.context, req.userMessage, retrieved)

    bucket = st.bucket(req.bucket)
    # Raw confidence p = π_θ(a|s,z) blended with the agent's track record in this context.
    # Policy softmax-share alone is a poor approval predictor (low, ~1/N); the agent should
    # grow more confident where its past calls have been approved (§9.5 calibration target).
    # Trust the track record more as volume accumulates (w → 0.85).
    w = min(0.85, bucket.volume / 15.0)
    raw_conf = (1.0 - w) * pol.confidence + w * bucket.agreement_ewma
    res = G.decide(
        raw_conf,
        req.stakes,
        bucket.level,
        temperature=st.temperature,
        beta_params=bucket.beta_params(),
    )
    return {
        "action": pol.action,
        "decision": res.decision,           # auto | ask | copilot
        "confidence": round(raw_conf, 3),   # raw p — feed THIS back to /feedback for calibration
        "p_hat": round(res.p_hat, 3),       # calibrated
        "tau": round(res.tau, 3),
        "explored": res.explored,
        "level": bucket.level,
        "rationale": pol.rationale,
        "candidates": pol.candidates,
    }


# ── feedback → labels (§9.3/§9.4/§9.5/§9.7) ───────────────────────────────────────
@app.post("/feedback")
def feedback(req: FeedbackReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)

    # 1) preference pair → reward model (chosen ≻ rejected)
    if req.chosen and req.rejected:
        xp = embed(f"{req.context} || {req.chosen}")
        xn = embed(f"{req.context} || {req.rejected}")
        st.reward.step_pair(xp, xn)

    # 2) autonomy bucket + calibration data
    bucket = st.bucket(req.bucket)
    st.calib.append((req.confidence, 1 if req.agreed else 0))
    st.calib = st.calib[-500:]
    # Refit temperature + ECE on a RECENT window: calibration should track the agent's
    # current behavior, not its cold-start humility, so a stabilized agent can promote.
    recent = st.calib[-25:]
    confs = [c for c, _ in recent]
    corr = [y for _, y in recent]
    st.temperature = G.fit_temperature(confs, corr)
    ece = G.expected_calibration_error([G.calibrate(c, st.temperature) for c in confs], corr)
    bucket.set_ece(ece)
    before = bucket.level
    event = bucket.record(req.agreed, req.confidence)
    METRICS["feedback"] += 1
    if event["changed"]:
        METRICS["autonomy_changes"] += 1
        if _LEVELS.index(bucket.level) > _LEVELS.index(before):
            METRICS["promotions"] += 1
    if event["drift"]:
        METRICS["drift_events"] += 1
    return {"bucket": event, "temperature": round(st.temperature, 3), "ece": round(ece, 3)}


# ── ground-truth meeting outcome → supervised reward anchor (§9.4) ────────────────
@app.post("/meeting-outcome")
def meeting_outcome(req: OutcomeReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)
    y = 1.0 if (req.occurred and (req.rating is None or req.rating >= 3)) else 0.0
    x = embed(f"{req.context} || {req.action}")
    loss = st.reward.step_outcome(x, y)
    return {"ok": True, "y": y, "reward_loss": round(loss, 4), "reward_version": st.reward.version}


# ── observability: inspect a user's learned state ─────────────────────────────────
@app.get("/persona/{uid}")
def get_persona(uid: str, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(uid)
    recent = st.calib[-25:]
    confs = [G.calibrate(c, st.temperature) for c, _ in recent]
    corr = [y for _, y in recent]
    return {
        "userId": uid,
        "persona": st.posterior.to_dict(),
        "traits": P.decode_traits(st.posterior),
        "var": st.posterior.var.tolist(),
        "correlation": _top_correlation(st.posterior),
        "uncertainty": float(np.mean(st.posterior.var)),
        "behaviors": len(st.behaviors),
        "temperature": round(st.temperature, 3),
        "ece": round(G.expected_calibration_error(confs, corr), 3) if confs else None,
        "buckets": {k: v.to_dict() for k, v in st.buckets.items()},
        "reward_version": st.reward.version,
    }


# ── BALD active-learning NPC selection (§9.6) ─────────────────────────────────────
@app.post("/select-npc")
def select_npc(req: SelectNpcReq, authorization: str = Header(None)):
    _auth(authorization)
    st = STORE.get(req.userId)
    npcs = [(n["id"], np.array(n["axes_vec"], dtype=float)) for n in req.npcs]
    scores = bald_scores(st.posterior, npcs, samples=req.samples)
    return {
        "selected": scores[0].npc_id if scores else None,
        "ranking": [
            {"npc": s.npc_id, "info_gain": round(s.score, 4), "p": round(s.predictive_p, 3)}
            for s in scores[:10]
        ],
    }


# ── observability (§14) ───────────────────────────────────────────────────────────
@app.get("/metrics")
def metrics(authorization: str = Header(None)):
    _auth(authorization)
    uids = STORE.all_user_ids()
    levels = {"copilot": 0, "supervised": 0, "auto": 0}
    eces, agreements = [], []
    for uid in uids:
        st = STORE.get(uid)
        for b in st.buckets.values():
            levels[b.level] = levels.get(b.level, 0) + 1
            agreements.append(b.agreement_ewma)
            if b.ece < 1.0:
                eces.append(b.ece)
    avg = lambda xs: round(sum(xs) / len(xs), 4) if xs else None
    return {
        "users": len(uids),
        "autonomy_levels": levels,
        "avg_ece": avg(eces),
        "avg_agreement": avg(agreements),
        **METRICS,
        "cost": METER.snapshot(),
    }


# ── erasure (§13) ─────────────────────────────────────────────────────────────────
@app.delete("/user/{uid}")
def delete_user(uid: str, authorization: str = Header(None)):
    _auth(authorization)
    return {"deleted": STORE.delete(uid)}
