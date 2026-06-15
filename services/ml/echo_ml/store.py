"""Per-user learning state (§9.9: lightweight, no per-user LLM weights).

Holds {persona posterior, reward head, behavior index, autonomy buckets, calibration
data}. In-memory by default; optionally hydrated/persisted to Supabase. The behavior
index is an in-process cosine store mirroring the pgvector `behavior_index` table.
"""
from __future__ import annotations

from dataclasses import dataclass, field
import threading
import numpy as np

from .persona import Posterior, prior
from .reward import RewardModel
from .autonomy import Bucket
from .embeddings import cosine
from .config import HYPER


@dataclass
class BehaviorEntry:
    embedding: np.ndarray
    action_text: str
    context: str


@dataclass
class UserState:
    user_id: str
    posterior: Posterior = field(default_factory=prior)
    reward: RewardModel = field(default_factory=RewardModel.init)
    behaviors: list[BehaviorEntry] = field(default_factory=list)
    buckets: dict[str, Bucket] = field(default_factory=dict)
    temperature: float = HYPER.temperature_init
    # calibration training data: (raw_confidence, agreed)
    calib: list[tuple[float, int]] = field(default_factory=list)
    # snapshot of the persona prior mean for drift comparison
    baseline_mu: np.ndarray | None = None

    def bucket(self, name: str) -> Bucket:
        if name not in self.buckets:
            self.buckets[name] = Bucket(name)
        return self.buckets[name]

    def retrieve(self, query_emb: np.ndarray, k: int = 5) -> list[str]:
        """Top-k past behaviors by cosine similarity (§9.3 retrieval)."""
        if not self.behaviors:
            return []
        scored = [(cosine(query_emb, b.embedding), b.action_text) for b in self.behaviors]
        scored.sort(key=lambda s: s[0], reverse=True)
        return [t for _, t in scored[:k]]


class Store:
    def __init__(self):
        self._users: dict[str, UserState] = {}
        self._lock = threading.Lock()

    def get(self, user_id: str) -> UserState:
        with self._lock:
            if user_id not in self._users:
                self._users[user_id] = UserState(user_id)
            return self._users[user_id]

    def delete(self, user_id: str) -> bool:
        """Hard delete all derived state for a user (§13 erasure)."""
        with self._lock:
            return self._users.pop(user_id, None) is not None

    def all_user_ids(self) -> list[str]:
        with self._lock:
            return list(self._users.keys())


STORE = Store()
