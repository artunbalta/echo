"""Language-agnostic stylometry features (WI-3).

The old featurizer keyed persona evidence off English token lists ("thanks", "you",
"maybe", "i think"), which zero out for a Turkish user and collapse their persona. These
features are instead **ratios and distributions** over characters/tokens/sentences that
carry the same stylistic signal in any language — punctuation intensity, capitalization,
emoji use, lexical diversity, length, sentence structure — plus a *pluggable, per-language*
hedging/assertiveness lexicon (default Turkish + English) so we never hard-code one tongue.

Every feature is finite and bounded (ratios in [0,1] or tanh-squashed into [-1,1]) for any
input, including empty, emoji-only, or very long messages. The output vector order is fixed
by STYLOMETRY_FEATURE_NAMES so the learned measurement matrix W (WI-2) stays aligned.
"""
from __future__ import annotations

import re
import numpy as np

# Fixed feature order — W (WI-2) and feature_names() depend on this exact sequence.
STYLOMETRY_FEATURE_NAMES = [
    "exclaim_ratio",      # '!' per token (tanh)
    "question_ratio",     # '?' per token (tanh)
    "ellipsis_ratio",     # '…'/'...' per token (tanh)
    "comma_ratio",        # ',' per token (tanh)
    "cap_ratio",          # uppercase letters / letters  [0,1]
    "emoji_ratio",        # emoji per token (tanh)
    "digit_ratio",        # digits / chars  [0,1]
    "length_z",           # message length z-scored vs running/global stats (tanh)
    "mean_token_len",     # mean word length, centered (tanh)
    "var_token_len",      # word-length dispersion (tanh)
    "type_token_ratio",   # lexical diversity = unique/total tokens  [0,1]
    "sentence_count",     # # sentences, centered (tanh)
    "mean_sentence_len",  # words per sentence, centered (tanh)
    "hedging",            # hedge − assertive lexicon balance (tanh, per-language)
]

STYLOMETRY_DIM = len(STYLOMETRY_FEATURE_NAMES)

# Pluggable, per-language lexicons (default Turkish + English). Replace/extend per locale;
# these are the ONLY lexical features and they are explicitly multilingual, not English-only.
HEDGE_LEXICON = {
    "en": ["maybe", "perhaps", "probably", "i think", "i guess", "sort of", "kind of",
           "possibly", "might", "i suppose"],
    "tr": ["belki", "sanırım", "galiba", "bence", "muhtemelen", "gibi", "herhalde",
           "sanki", "olabilir"],
}
ASSERTIVE_LEXICON = {
    "en": ["definitely", "absolutely", "must", "always", "never", "certainly", "sure",
           "clearly", "obviously"],
    "tr": ["kesinlikle", "mutlaka", "her zaman", "asla", "tabii", "eminim", "açıkça",
           "elbette"],
}

# Emoji codepoint ranges (no external dependency). Covers emoticons, pictographs, transport,
# symbols/dingbats, supplemental symbols, and flags.
_EMOJI_RANGES = [
    (0x1F300, 0x1FAFF), (0x2600, 0x27BF), (0x2300, 0x23FF),
    (0x1F1E6, 0x1F1FF), (0x2B00, 0x2BFF), (0xFE00, 0xFE0F),
]


def _emoji_count(text: str) -> int:
    n = 0
    for ch in text:
        o = ord(ch)
        for lo, hi in _EMOJI_RANGES:
            if lo <= o <= hi:
                n += 1
                break
    return n


def _lexicon_ratio(lower_text: str, n_tokens: int, lexicon: dict) -> float:
    """Fraction of tokens matching any (single- or multi-word) lexicon entry across all
    configured languages. Phrase entries are matched as substrings with space padding."""
    padded = f" {lower_text} "
    c = 0
    for words in lexicon.values():
        for w in words:
            c += padded.count(f" {w} ") if " " not in w else padded.count(w)
    return c / max(1, n_tokens)


def stylometry_features(text: str, length_stats: tuple[float, float] | None = None) -> np.ndarray:
    """Return the fixed-order language-agnostic style vector for `text`.

    length_stats = (mean_words, std_words) z-scores message length against the user's own
    running distribution when provided; otherwise a global prior (12 ± 10 words) is used.
    All entries are finite and bounded for empty / emoji-only / very long inputs.
    """
    t = text or ""
    tokens = t.split()
    n = len(tokens)
    n_safe = max(1, n)
    chars = len(t)
    char_safe = max(1, chars)
    letters = sum(ch.isalpha() for ch in t)
    let_safe = max(1, letters)
    lower = t.lower()

    exclaim = np.tanh(t.count("!") / n_safe)
    question = np.tanh(t.count("?") / n_safe)
    ellipsis = np.tanh((t.count("…") + t.count("...")) / n_safe)
    comma = np.tanh(t.count(",") / n_safe)
    cap = sum(ch.isupper() for ch in t) / let_safe
    emoji = np.tanh(_emoji_count(t) / n_safe)
    digit = sum(ch.isdigit() for ch in t) / char_safe

    mean_n, std_n = length_stats if length_stats else (12.0, 10.0)
    length_z = np.tanh((n - mean_n) / max(1.0, std_n))

    word_lens = [len(w) for w in tokens] or [0]
    mean_token_len = np.tanh((float(np.mean(word_lens)) - 4.5) / 2.0)
    var_token_len = np.tanh(float(np.std(word_lens)) / 3.0)

    ttr = len({w.lower() for w in tokens}) / n_safe if n else 0.0

    sentences = [s for s in re.split(r"[.!?…]+", t) if s.strip()]
    n_sent = max(1, len(sentences))
    sentence_count = np.tanh((len(sentences) - 1) / 3.0)
    mean_sentence_len = np.tanh((n / n_sent - 10.0) / 10.0)

    hedge = _lexicon_ratio(lower, n, HEDGE_LEXICON)
    assertive = _lexicon_ratio(lower, n, ASSERTIVE_LEXICON)
    hedging = np.tanh((hedge - assertive) * 3.0)

    feats = np.array([
        exclaim, question, ellipsis, comma, cap, emoji, digit,
        length_z, mean_token_len, var_token_len, ttr,
        sentence_count, mean_sentence_len, hedging,
    ], dtype=float)
    return np.nan_to_num(feats, nan=0.0, posinf=1.0, neginf=-1.0)
