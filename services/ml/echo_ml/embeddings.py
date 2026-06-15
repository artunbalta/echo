"""Embeddings (§9.1). Maps text (and structured context/action) into a common vector
space used by the persona model and behavior retrieval.

Default provider is a deterministic hashing embedder so the whole engine runs and tests
without an external API. Swap to a real provider (Voyage/OpenAI) via EMBEDDINGS_PROVIDER.
"""
from __future__ import annotations

import hashlib
import numpy as np

from .config import SETTINGS


def _hash_embed(text: str, dim: int) -> np.ndarray:
    """Deterministic bag-of-hashed-tokens embedding, L2-normalized.

    Stable across processes (unlike Python's salted hash), so retrieval is reproducible
    and unit tests are deterministic.
    """
    vec = np.zeros(dim, dtype=np.float64)
    tokens = text.lower().split()
    if not tokens:
        tokens = ["<empty>"]
    for tok in tokens:
        h = hashlib.sha1(tok.encode("utf-8")).digest()
        # Use 4 byte-windows to spread each token across several dimensions.
        for k in range(4):
            idx = int.from_bytes(h[k * 4 : k * 4 + 4], "little") % dim
            sign = 1.0 if h[(k + 16) % 20] & 1 else -1.0
            vec[idx] += sign
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def embed(text: str) -> np.ndarray:
    dim = SETTINGS.embed_dim
    provider = SETTINGS.embeddings_provider
    if provider == "mock" or not SETTINGS.embeddings_key:
        return _hash_embed(text, dim)
    # Real providers would call out here; we fall back to mock if unconfigured.
    return _hash_embed(text, dim)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))
