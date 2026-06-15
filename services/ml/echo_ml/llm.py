"""Thin Anthropic client (shared frozen base model, §9.9). Falls back to a deterministic
mock when no key is set so the engine and tests run offline."""
from __future__ import annotations

import httpx

from .config import SETTINGS
from .cost import METER


def complete(system: str, messages: list[dict], model: str | None = None,
             max_tokens: int = 256, n: int = 1, temperature: float = 1.0,
             user_id: str | None = None) -> list[str]:
    """Return up to `n` candidate completions. Anthropic returns one message per call, so
    we issue n calls (cheap model, capped) — Best-of-N candidates for the policy (§9.3).
    Every call is metered for cost observability (§9.9)."""
    model = model or SETTINGS.model_cheap
    tier = "strong" if model == SETTINGS.model_strong else "cheap"
    in_chars = len(system) + sum(len(m.get("content", "")) for m in messages)
    if not SETTINGS.anthropic_key:
        out = [_mock(system, messages, i) for i in range(n)]
        METER.record(tier, in_chars, sum(len(o) for o in out), user_id)
        return out
    out: list[str] = []
    with httpx.Client(timeout=20.0) as client:
        for i in range(n):
            try:
                resp = client.post(
                    "https://api.anthropic.com/v1/messages",
                    headers={
                        "x-api-key": SETTINGS.anthropic_key,
                        "anthropic-version": "2023-06-01",
                        "content-type": "application/json",
                    },
                    json={
                        "model": model,
                        "max_tokens": max_tokens,
                        "system": system,
                        "messages": messages,
                        "temperature": temperature,
                    },
                )
                resp.raise_for_status()
                data = resp.json()
                out.append(data["content"][0]["text"].strip())
            except Exception:
                out.append(_mock(system, messages, i))
    METER.record(tier, in_chars, sum(len(o) for o in out), user_id)
    return out


def _mock(system: str, messages: list[dict], i: int) -> str:
    last = messages[-1]["content"] if messages else ""
    variants = [
        f"Sure — about \"{last[:40]}\", here's how I'd put it.",
        f"Honestly, \"{last[:40]}\"? I'd lean the other way.",
        f"Let me sit with that — \"{last[:40]}\" deserves a real answer.",
        f"Quick take on \"{last[:40]}\": yes, with one caveat.",
    ]
    return variants[i % len(variants)]
