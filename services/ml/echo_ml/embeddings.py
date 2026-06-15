"""Embeddings (§9.1). Maps text (and structured context/action) into a common vector
space used by behavior retrieval (§9.3), the reward head (§9.4), and the language-
independent persona featurizer (WI-3).

Providers:
  * "mock"  — deterministic SHA1 bag-of-hashed-tokens. No semantics: only literal token
              overlap makes two texts similar. Runs offline, deterministic for tests.
  * "voyage" — Voyage AI multilingual embeddings (DEFAULT real provider). voyage-3.5 maps
              Turkish and English into one shared 256-d space, which is exactly what fixes
              the "Turkish collapse" of the old English-token featurizer. Called via the
              official `voyageai` client (optional dependency); falls back to the REST API
              over httpx, then to the hash embedder. Keyed by VOYAGE_API_KEY.
  * "openai" — OpenAI text-embedding-3-* over HTTP (Matryoshka `dimensions`).

Contract: embed() ALWAYS returns an L2-normalized vector of SETTINGS.embed_dim (256). The
reward head fixes its input dimension at init (reward.py) and pgvector columns are 256-d,
so every embedding — mock or remote — must be exactly that length; a model emitting a
larger vector (e.g. 1024) is Matryoshka-truncated to 256 and re-normalized. Any provider
failure degrades gracefully to the hash embedder so the online loop never breaks.

Asymmetric input types (Voyage encodes queries vs documents differently): pass
input_type="document" when indexing a behavior and "query" when retrieving for the agent.
The hash mock ignores input_type (deterministic), so cosine() behaves identically offline.
"""
from __future__ import annotations

import hashlib
import httpx
import numpy as np

from .config import SETTINGS


def _hash_embed(text: str, dim: int) -> np.ndarray:
    """Deterministic bag-of-hashed-tokens embedding, L2-normalized.

    Stable across processes (unlike Python's salted hash), so retrieval is reproducible
    and unit tests are deterministic. No semantics — similarity = literal token overlap.
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


def _l2(vec: np.ndarray) -> np.ndarray:
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def _fit_dim(vec: np.ndarray, dim: int) -> np.ndarray:
    """Force a remote vector to exactly `dim` (Matryoshka truncate, or zero-pad) before
    re-normalizing — in case a model emits 1024 when we asked for 256."""
    if vec.shape[0] > dim:
        vec = vec[:dim]
    elif vec.shape[0] < dim:
        vec = np.concatenate([vec, np.zeros(dim - vec.shape[0])])
    return vec


# Reuse one HTTP client (connection pool) across calls; short timeout keeps the online
# loop responsive, and any failure falls back to the hash embedder.
_HTTP = httpx.Client(timeout=10.0)

# Cache the optional voyageai client so we import/construct it at most once.
_VOYAGE_CLIENT = None
_VOYAGE_TRIED = False


def _voyage_client():
    """Lazily construct the official voyageai client. Returns None if the package is not
    installed (optional dependency) so we can fall back to the REST path."""
    global _VOYAGE_CLIENT, _VOYAGE_TRIED
    if _VOYAGE_TRIED:
        return _VOYAGE_CLIENT
    _VOYAGE_TRIED = True
    try:
        import voyageai  # optional — guarded so tests/no-key runs never require it
        _VOYAGE_CLIENT = voyageai.Client(api_key=SETTINGS.voyage_key)
    except Exception:
        _VOYAGE_CLIENT = None
    return _VOYAGE_CLIENT


def _voyage_embed(text: str, dim: int, input_type: str) -> np.ndarray:
    """Voyage AI embedding. input_type ∈ {"document","query"} (asymmetric encoding).
    Prefers the official client; falls back to the REST API. Matryoshka models natively
    emit `output_dimension` ∈ {256,512,1024,2048}; we request 256 to match embed_dim."""
    model = SETTINGS.voyage_model or "voyage-3.5"
    it = input_type if input_type in ("document", "query") else "document"
    client = _voyage_client()
    if client is not None:
        res = client.embed([text], model=model, input_type=it, output_dimension=dim)
        vec = np.array(res.embeddings[0], dtype=np.float64)
        return _l2(_fit_dim(vec, dim))
    # REST fallback (no SDK installed) — https://docs.voyageai.com/reference/embeddings-api
    res = _HTTP.post(
        "https://api.voyageai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {SETTINGS.voyage_key}"},
        json={"input": [text], "model": model, "input_type": it, "output_dimension": dim},
    )
    res.raise_for_status()
    vec = np.array(res.json()["data"][0]["embedding"], dtype=np.float64)
    return _l2(_fit_dim(vec, dim))


def _openai_embed(text: str, dim: int, input_type: str) -> np.ndarray:
    # https://platform.openai.com/docs/api-reference/embeddings — text-embedding-3-* support
    # the `dimensions` param (Matryoshka truncation), so we can ask for exactly embed_dim.
    # OpenAI embeddings are symmetric, so input_type is accepted and ignored.
    model = SETTINGS.embeddings_model or "text-embedding-3-small"
    res = _HTTP.post(
        "https://api.openai.com/v1/embeddings",
        headers={"Authorization": f"Bearer {SETTINGS.embeddings_key}"},
        json={"input": text, "model": model, "dimensions": dim},
    )
    res.raise_for_status()
    vec = np.array(res.json()["data"][0]["embedding"], dtype=np.float64)
    return _l2(_fit_dim(vec, dim))


_REMOTE = {"voyage": _voyage_embed, "openai": _openai_embed}


def _provider_key(provider: str) -> str:
    return SETTINGS.voyage_key if provider == "voyage" else SETTINGS.embeddings_key


def embed(text: str, input_type: str = "document") -> np.ndarray:
    """Embed `text` to an L2-normalized SETTINGS.embed_dim vector.

    input_type ∈ {"document","query"}: pass "document" when indexing a behavior and
    "query" when retrieving for the agent (Voyage encodes them differently). Falls back to
    the deterministic hash embedder when the provider is mock/unconfigured or on any error.
    """
    dim = SETTINGS.embed_dim
    provider = SETTINGS.embeddings_provider
    fn = _REMOTE.get(provider)
    if fn is None or not _provider_key(provider):
        return _hash_embed(text, dim)
    try:
        return fn(text or "", dim, input_type)
    except Exception as err:  # network, auth, rate-limit, bad response — never break the loop
        print(f"[embeddings] {provider} failed, using hash fallback: {err}")
        return _hash_embed(text, dim)


def cosine(a: np.ndarray, b: np.ndarray) -> float:
    na, nb = np.linalg.norm(a), np.linalg.norm(b)
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))
