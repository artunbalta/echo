"""WI-3 (§9.1) — language-independent features: stylometry + featurize_raw."""
import numpy as np
import pytest
from echo_ml import persona as P
from echo_ml.stylometry import stylometry_features, STYLOMETRY_DIM, STYLOMETRY_FEATURE_NAMES
from echo_ml.embeddings import embed, cosine, _hash_embed


# ── stylometry: finite & bounded for degenerate inputs ────────────────────────────
@pytest.mark.parametrize("text", [
    "", "   ", "😀😀😀🎉🔥", "!!!!!!", "?", "...",
    "a", "word " * 4000, "ALL CAPS SHOUTING!!!", "12345 67890",
])
def test_stylometry_finite_and_bounded(text):
    s = stylometry_features(text)
    assert s.shape == (STYLOMETRY_DIM,)
    assert np.all(np.isfinite(s))
    assert np.all(np.abs(s) <= 1.0 + 1e-9)   # ratios in [0,1] or tanh-squashed


def test_stylometry_names_match_dim():
    assert len(STYLOMETRY_FEATURE_NAMES) == STYLOMETRY_DIM


# ── the Turkish-collapse fix: stylometry is language-agnostic ──────────────────────
def test_stylometry_punctuation_is_language_invariant():
    # The punctuation-intensity block is structural, not lexical-English: two messages with
    # the same token count and punctuation in different languages produce identical values.
    # (Word-length / diversity features legitimately differ — Turkish words are longer —
    #  so we isolate the truly language-invariant core here.)
    tr = "Teşekkürler! Nasılsın? Evet, görüşürüz!"   # 4 tokens, 2 '!', 1 '?', 1 ','
    en = "Thanks! Okay? Yes, bye!"                    # 4 tokens, 2 '!', 1 '?', 1 ','
    s_tr, s_en = stylometry_features(tr), stylometry_features(en)
    punct = [STYLOMETRY_FEATURE_NAMES.index(k)
             for k in ("exclaim_ratio", "question_ratio", "ellipsis_ratio", "comma_ratio")]
    assert np.allclose(s_tr[punct], s_en[punct], atol=1e-9)
    # And Turkish stylometry is non-degenerate (the old English-token featurizer collapsed).
    assert np.linalg.norm(s_tr) > 0.1


def test_stylometry_separates_terse_from_verbose():
    terse = stylometry_features("yeah ok")
    verbose = stylometry_features(
        "Honestly, I have been thinking about this quite a lot and I believe there are "
        "several considerations we ought to weigh carefully before deciding anything."
    )
    assert not np.allclose(terse, verbose)


# ── featurize_raw: shape, finiteness, non-degeneracy ──────────────────────────────
def test_featurize_raw_shape_and_finite():
    phi = P.featurize_raw("Selam, bugün nasıl gidiyor?", {"latencyMs": 800, "editsCount": 2})
    assert phi.shape == (P.FEATURE_DIM,)
    assert np.all(np.isfinite(phi))
    assert len(P.feature_names()) == P.FEATURE_DIM


def test_feature_dim_decomposition():
    from echo_ml.config import HYPER
    assert P.FEATURE_DIM == HYPER.embed_proj_dim + STYLOMETRY_DIM + len(P.TELEMETRY_FEATURE_NAMES)


def test_featurize_raw_turkish_is_non_degenerate():
    # A Turkish-only message must produce a rich, non-zero φ (the old English-token
    # featurizer would zero out most evidence here).
    phi = P.featurize_raw("Sanırım belki yarın buluşabiliriz, ne dersin?", {})
    assert np.linalg.norm(phi) > 0.1
    assert np.count_nonzero(np.abs(phi) > 1e-6) > 5


def test_featurize_raw_is_language_independent_under_multilingual_embedder():
    # When a multilingual embedder maps a TR message and its EN translation to the SAME
    # vector (which voyage-3.5 approximates), and style is matched, φ is ~language-invariant.
    shared = _hash_embed("shared semantic content", P.SETTINGS.embed_dim)
    tr = "Harika! Sen çok naziksin, teşekkürler!"
    en = "Great! You are very kind, thanks!"
    phi_tr = P.featurize_raw(tr, {}, embedding=shared)
    phi_en = P.featurize_raw(en, {}, embedding=shared)
    assert cosine(phi_tr, phi_en) > 0.9


def test_telemetry_features_present_and_absent():
    phi_with = P.featurize_raw("hi", {"latencyMs": 200})
    phi_without = P.featurize_raw("hi", {})
    # has_latency flag differs; presence is explicit.
    names = P.feature_names()
    idx = names.index("has_latency")
    assert phi_with[idx] == 1.0 and phi_without[idx] == 0.0


# ── embeddings: input_type plumbing is safe for the mock ──────────────────────────
def test_embed_input_type_is_safe_for_mock():
    # Hash mock ignores input_type → deterministic, identical, L2-normalized.
    q = embed("merhaba dünya", input_type="query")
    d = embed("merhaba dünya", input_type="document")
    assert np.allclose(q, d)
    assert np.isclose(np.linalg.norm(q), 1.0)
