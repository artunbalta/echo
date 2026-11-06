"""Fetch the public data the studies run on, into research/deeds/data/ (not committed).

- Study 1: Twin-2K-500 (Toubia et al. 2025, CC-BY-4.0) and its mega-study, from HuggingFace. The persona
  texts (full_persona/, wave_split/) are skipped by default: the study reads the answers, not the prompts.
- Study 2: the Basel–Berlin Risk Study (Frey et al. 2017, CC BY 4.0, OSF rce7g): the seven risk tasks
  and the questionnaire scores, main sample and both retests, per person.

    /opt/anaconda3/bin/python3.13 research/deeds/fetch.py [--personas]
"""
import json
import pathlib
import sys
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor

HERE = pathlib.Path(__file__).resolve().parent
DATA = HERE / "data"
REPOS = ["LLM-Digital-Twin/Twin-2K-500", "LLM-Digital-Twin/Twin-2K-500-Mega-Study"]
SKIP = ("full_persona/", "wave_split/", ".DS_Store", ".png", ".pdf")


def tree(repo):
    with urllib.request.urlopen(f"https://huggingface.co/api/datasets/{repo}/tree/main?recursive=true") as r:
        return [it for it in json.load(r) if it.get("type") == "file"]


def fetch(repo, item):
    dest = DATA / repo.split("/")[1] / item["path"]
    if dest.exists() and dest.stat().st_size == item.get("size", -1):
        return f"have  {dest.relative_to(DATA)}"
    dest.parent.mkdir(parents=True, exist_ok=True)
    url = f"https://huggingface.co/datasets/{repo}/resolve/main/{urllib.parse.quote(item['path'])}"
    tmp = dest.with_suffix(dest.suffix + ".part")
    with urllib.request.urlopen(url) as r, open(tmp, "wb") as f:
        while chunk := r.read(1 << 20):
            f.write(chunk)
    tmp.rename(dest)
    return f"got   {dest.relative_to(DATA)} ({item.get('size', 0) / 1e6:.1f} MB)"


# Basel–Berlin Risk Study: local name → OSF download (listed from osf.io/rce7g on 2026-11-06).
BBRS = {
    "main__bart__bart": "2nxy7", "main__cct__cct_overt": "qyg7d", "main__dfd__dfd_perpers": "yjk8x", "main__dfe__dfe_perpers": "e5y3w",
    "main__lotteries__lotteriesOvert": "eq9jh", "main__mpl__mplBehavior": "bg6dq", "main__mt__mt": "8we7c", "quest_scores": "tckbj",
    "retest_berlin__bart__bart": "tec3g", "retest_berlin__cct__cct_overt": "k826r", "retest_berlin__dfd__dfd_perpers": "yfn74",
    "retest_berlin__dfe__dfe_perpers": "mbzwe", "retest_berlin__lotteries__lotteriesOvert": "yzhmv", "retest_berlin__mpl__mplBehavior": "exgq9",
    "retest_berlin__mt__mt": "2nzte", "retest_berlin__quest__quest_scores": "a72nk",
    "retest_basel__bart__bart": "2r3c6", "retest_basel__cct__cct_overt": "wghqc", "retest_basel__dfd__dfd_perpers": "se3gm",
    "retest_basel__dfe__dfe_perpers": "q6t3v", "retest_basel__lotteries__lotteriesOvert": "s87w6", "retest_basel__mpl__mplBehavior": "52vza",
    "retest_basel__mt__mt": "krs7d", "retest_basel__quest__quest_scores": "5bdae",
}


def fetch_bbrs():
    out = DATA / "bbrs"
    out.mkdir(parents=True, exist_ok=True)
    for name, key in BBRS.items():
        dest = out / f"{name}.csv"
        if dest.exists() and dest.stat().st_size > 0:
            print(f"have  bbrs/{name}.csv")
            continue
        req = urllib.request.Request(f"https://osf.io/download/{key}/", headers={"User-Agent": "echo-research/1.0"})
        with urllib.request.urlopen(req) as r:
            dest.write_bytes(r.read())
        print(f"got   bbrs/{name}.csv")


def main():
    fetch_bbrs()
    personas = "--personas" in sys.argv
    jobs = []
    for repo in REPOS:
        for item in tree(repo):
            p = item["path"]
            if any(s in p for s in SKIP) and not (personas and p.startswith(("full_persona/", "wave_split/"))):
                continue
            jobs.append((repo, item))
    with ThreadPoolExecutor(8) as pool:
        for line in pool.map(lambda j: fetch(*j), jobs):
            print(line, flush=True)


if __name__ == "__main__":
    main()
