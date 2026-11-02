"""The research package's tests: `services/ml/.venv/bin/python -m pytest research/pilot/tests -q`."""
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))

import pytest  # noqa: E402

ROOT = HERE.parents[2]


@pytest.fixture(scope="session")
def root() -> Path:
    return ROOT


@pytest.fixture(scope="session")
def group8():
    """A small simulated group, made once."""
    from echo_pilot.simulate import make_group

    return make_group(8, seed=7)
