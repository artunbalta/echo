"""Words, deeds and the same situation again: the Twin-2K-500 study (PREREG.md)."""
import os

# Anaconda's OpenBLAS 0.3.30 is pathologically slow at multi-threaded SVD on this Mac (62 s for a 1852×900
# matrix, against 0.95 s on one thread). Parallelism is across processes instead. Set before numpy loads.
for _var in ("OPENBLAS_NUM_THREADS", "OMP_NUM_THREADS", "VECLIB_MAXIMUM_THREADS", "MKL_NUM_THREADS"):
    os.environ.setdefault(_var, "1")
