"""The study's tests: `/opt/anaconda3/bin/python3.13 -m pytest research/deeds/tests -q`, from anywhere."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import deeds  # noqa: E402,F401  (pins BLAS threads before numpy loads)
