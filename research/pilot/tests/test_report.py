"""The report: it renders from memory and from JSON, says SIMULATED when it is, and never prints a raw None or nan."""
import json
import re

import pytest

from echo_pilot import analysis as A
from echo_pilot import report as R


@pytest.fixture(scope="module")
def results(group8):
    export, truth = group8
    return A.analyze(export, mode="fast", truth=truth, ci=True, minutes=(0, 4, 25))


def _text(page: str) -> str:
    page = re.sub(r"<script>.*?</script>", "", page, flags=re.S)
    page = re.sub(r"<style>.*?</style>", "", page, flags=re.S)
    return re.sub(r"<[^>]+>", " ", page)


def test_it_renders_from_memory_and_from_json(results):
    page = R.render(results)
    again = json.loads(R.to_json(results))
    page2 = R.render(again)
    for p in (page, page2):
        assert p.startswith("<title>Who Knows You Best</title>")
        assert "SIMULATED" in p
        assert p.count("<svg") >= 6
        words = _text(p)
        assert not re.search(r"\bNone\b|\bnan\b", words), re.findall(r".{30}(?:None|nan).{30}", words)[:3]
    assert len(re.findall(r"<h2>", page)) == len(re.findall(r"<h2>", page2))


def test_headlines_follow_the_numbers(results):
    flipped = json.loads(R.to_json(results))
    w = flipped["settings"]["again"]["witnesses"]
    w["echo_2l"]["skill"], w["echo_axes"]["skill"] = -0.1, 0.2
    flipped["gap"]["give"]["gap"] = -0.2
    page = R.render(flipped)
    assert "did not know the next choice better than one" in page
    assert "People gave the bread they promised" in page
    assert "two layers know the next choice; one layer does not" not in page


def test_a_real_export_is_not_called_simulated(results):
    real = json.loads(R.to_json(results))
    real["simulated"] = False
    page = R.render(real)
    assert "SIMULATED" not in page and "pilot results" in page


def test_power_and_a_third_visit_render(results):
    from echo_pilot.power import TESTS

    def run(scale: float) -> dict:
        return {"reps": 10, "seconds": 60, "sizes": {str(n): {"power": {t: min(1.0, scale * n / 40) for t in TESTS}} for n in (8, 16, 40)}}

    page = R.render(results, power=run(1.0), power3=run(1.5))
    assert "What a third visit buys" in page and "runs/power-3visits.json" in page
    assert "About 40 people for the central test" in page
    words = _text(page)
    assert not re.search(r"\bNone\b|\bnan\b", words)
