"""Per-user learning state (§9.9: lightweight, no per-user LLM weights).

Holds {persona posterior, reward head, behavior index, autonomy buckets, calibration
data}. In-memory by default; optionally hydrated/persisted to Supabase. The behavior
index is an in-process cosine store mirroring the pgvector `behavior_index` table.
"""
from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
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
    # Per-context conditional posteriors (event-schema.md): a separate Posterior per context
    # value (e.g. "counterpart:server", "stakes:high") so the conditional signature — where
    # individuation lives — is recoverable. Keyed by the ingress cond_key.
    cond: dict[str, Posterior] = field(default_factory=dict)
    temperature: float = HYPER.temperature_init
    # calibration training data: (raw_confidence, agreed)
    calib: list[tuple[float, int]] = field(default_factory=list)
    # snapshot of the persona prior mean for drift comparison
    baseline_mu: np.ndarray | None = None
    # P3: passive locomotion scalars (heading_change_rate, path_tortuosity, novel_tile_ratio,
    # backtrack_rate, ...) RECORDED as the * re-anchor's training corpus (known-gaps #2).
    # Deliberately NOT featurized yet - the committed W has no telemetry->openness path; these
    # start moving the posterior only after the one-time P5 re-anchor. Bounded ring buffer.
    locomotion: list[dict] = field(default_factory=list)

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
    """The per-user state map, and the per-user WRITE lock that guards it.

    THE LOCK IS NOT OPTIONAL, and known-gaps ⚑16 is why. Every persona update is a
    read-modify-write across several statements in app.py::

        st = STORE.get(uid)
        st.posterior = P.observe(st.posterior, action, telemetry)

    `self._lock` below only ever protected the `_users` DICT. Two requests for the SAME user get the
    same `UserState` object, both read `st.posterior`, both compute, and the second assignment
    overwrites the first. The observation is gone: no error, no log, and a posterior that looks fine.
    FastAPI runs sync `def` endpoints in a threadpool, so two in-flight requests for one user really
    are two threads in this code at once.

    Measured before the fix: eight concurrent observations for one actor produced ``behaviors 8`` and
    ``persona.version 2``. Six discarded. Since F2 and F3 emit two events per actor per interaction,
    roughly half of every live player-to-player measurement was being dropped.

    Keyed PER USER, not globally: the loss is per user (six different users posted concurrently each
    landed intact), and a global lock would serialize unrelated traffic for nothing.

    SCOPE, stated plainly rather than assumed. This is an in-process `threading.RLock`, so it
    serializes threads inside ONE Python process and nothing more. That is sufficient for how this
    service is actually run — `uvicorn echo_ml.app:app` with no `--workers`, i.e. a single worker
    process, both in the Dockerfile and in run.sh, on a single Render instance. It is NOT sufficient
    under `--workers N`, multiple instances, or any horizontal scaling. Note though that the store
    itself is a process-local in-memory dict with no shared backing: under multiple workers a user's
    posterior would already depend on which worker served the request, which is a larger and more
    visible problem than the race. So this lock is exactly as complete as the store is, and the
    thing that would have to change first is the store, not the lock.
    """

    def __init__(self):
        self._users: dict[str, UserState] = {}
        self._lock = threading.Lock()
        # One write lock per user. Re-entrant so a caller already holding it can nest safely.
        self._user_locks: dict[str, threading.RLock] = {}

    def get(self, user_id: str) -> UserState:
        with self._lock:
            if user_id not in self._users:
                self._users[user_id] = UserState(user_id)
            return self._users[user_id]

    def lock_for(self, user_id: str) -> threading.RLock:
        """The write lock for one user. Created on demand; one entry per user, same as `_users`."""
        with self._lock:
            lk = self._user_locks.get(user_id)
            if lk is None:
                lk = threading.RLock()
                self._user_locks[user_id] = lk
            return lk

    @contextmanager
    def updating(self, user_id: str) -> Iterator[UserState]:
        """Exclusive read-modify-write on one user's state.

        Every endpoint that MUTATES a user must hold this for the whole read-modify-write, not just
        for the assignment: the read and the write are what have to be atomic together.
        """
        with self.lock_for(user_id):
            yield self.get(user_id)

    def delete(self, user_id: str) -> bool:
        """Hard delete all derived state for a user (§13 erasure)."""
        # Under the user's own lock, so erasure cannot land in the middle of an update and leave a
        # half-applied posterior behind for a user who asked to be forgotten.
        with self.lock_for(user_id):
            with self._lock:
                self._user_locks.pop(user_id, None)
                return self._users.pop(user_id, None) is not None

    def all_user_ids(self) -> list[str]:
        with self._lock:
            return list(self._users.keys())


STORE = Store()
