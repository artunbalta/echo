"""Cost + usage tracking (§9.9, §14 observability). Not stubbed: every LLM call through
this service is metered with a rough token estimate and per-model price, so cost-per-active-
user is observable and a daily budget can alarm. Prices are configurable and approximate —
the point is a real, live signal, not billing-grade accounting.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field

# Approx USD per 1K tokens (input+output blended). Override via env if desired.
PRICE_PER_1K = {
    "strong": float(os.getenv("PRICE_STRONG_PER_1K", "0.015")),
    "cheap": float(os.getenv("PRICE_CHEAP_PER_1K", "0.001")),
}
DAILY_BUDGET = float(os.getenv("COST_DAILY_USD_BUDGET", "25"))


@dataclass
class Meter:
    llm_calls: int = 0
    est_tokens: int = 0
    est_cost_usd: float = 0.0
    by_user: dict = field(default_factory=dict)
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def record(self, tier: str, in_chars: int, out_chars: int, user_id: str | None = None):
        # ~4 chars per token is the usual rough rule of thumb.
        tokens = (in_chars + out_chars) // 4
        price = PRICE_PER_1K.get(tier, PRICE_PER_1K["cheap"])
        cost = tokens / 1000.0 * price
        with self._lock:
            self.llm_calls += 1
            self.est_tokens += tokens
            self.est_cost_usd += cost
            if user_id:
                u = self.by_user.setdefault(user_id, {"calls": 0, "tokens": 0, "cost": 0.0})
                u["calls"] += 1
                u["tokens"] += tokens
                u["cost"] += cost

    def snapshot(self) -> dict:
        with self._lock:
            over = self.est_cost_usd > DAILY_BUDGET
            return {
                "llm_calls": self.llm_calls,
                "est_tokens": self.est_tokens,
                "est_cost_usd": round(self.est_cost_usd, 4),
                "daily_budget_usd": DAILY_BUDGET,
                "over_budget": over,
                "active_users": len(self.by_user),
                "cost_per_user_usd": round(self.est_cost_usd / max(1, len(self.by_user)), 4),
            }


METER = Meter()
