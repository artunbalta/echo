"""Numerical-stability helpers. Deliberately dependency-free (only numpy) so persona.py and
persona_model.py can both import it with no risk of an import cycle."""
from __future__ import annotations

import functools
import numpy as np


def quiet_fp(fn):
    """Suppress the *spurious* floating-point exception flags Apple's Accelerate BLAS raises on
    valid matmuls.

    Root cause: on macOS with NumPy 2.0 linked against the Accelerate (vecLib) backend, GEMM
    sets the divide-by-zero / overflow / invalid status flags even for finite, well-conditioned
    inputs, which NumPy surfaces as ``RuntimeWarning: ... encountered in matmul``. The computed
    values are correct: finite, and bit-identical to a non-BLAS (einsum) evaluation — proven in
    ``tests/test_numerical_stability.py``.

    This decorator changes *warning behaviour only* (``np.errstate``); it never alters a single
    bit of arithmetic. It is NOT a NaN/Inf rescue — real non-finite values are caught loudly by
    the finiteness assertions in that test, never hidden here.
    """
    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        with np.errstate(over="ignore", divide="ignore", invalid="ignore"):
            return fn(*args, **kwargs)

    return wrapper
