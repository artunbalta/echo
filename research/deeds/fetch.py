"""Fetch the public data the study runs on, into research/deeds/data/ (not committed).

Twin-2K-500 (Toubia et al. 2025, CC-BY-4.0) and its mega-study, from HuggingFace. The persona texts
(full_persona/, wave_split/) are skipped by default: the study reads the answers, not the prompts.

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


def main():
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
