"""The draft as a page to read: `python3 research/paper/page.py` (needs the `markdown` package).

Reads draft.md (made by build.py, never by hand) and writes draft.html: the same text, set as a paper,
in the report's palette, light and dark.
"""
import html
import re
from pathlib import Path

import markdown

HERE = Path(__file__).resolve().parent

CSS = """
/* A preprint: one measure of serif text, tables and formulae set quietly, the draft's status kept in view. */
:root {
  --paper: #f3f5f4; --sheet: #fbfcfb; --ink: #1c2a2e; --muted: #5a6a6e; --rule: #d3dbd8; --accent: #0d7f73; --warn: #9b3d2a; --warn-soft: #f5e2dc;
  --serif: "Source Serif 4", "Source Serif Pro", Georgia, serif;
  --sans: "IBM Plex Sans", "Helvetica Neue", Arial, sans-serif;
  --mono: "IBM Plex Mono", ui-monospace, Menlo, monospace;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; } }
:root[data-theme="dark"] {
  --paper: #0f1618; --sheet: #141d20; --ink: #e2eae8; --muted: #9aaaa8; --rule: #26343a; --accent: #3cc3b1; --warn: #f19a83; --warn-soft: #3a211b; color-scheme: dark; }
body { background: var(--paper); color: var(--ink); font: 18px/1.65 var(--serif); }
.page { max-width: 760px; margin: 0 auto; padding-block: 32px 96px; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); }
.page > * { min-width: 0; }
.status { font: 500 13.5px/1.5 var(--sans); color: var(--warn); background: var(--warn-soft); padding: 10px 14px; border-radius: 6px; margin-bottom: 28px; }
h1 { font: 600 clamp(30px, 5.4vw, 44px)/1.12 var(--serif); letter-spacing: -.01em; margin: 0 0 12px; text-wrap: balance; }
h2 { font: 600 24px/1.25 var(--serif); margin: 44px 0 10px; text-wrap: balance; }
h3 { font: 600 13px/1.3 var(--sans); letter-spacing: .08em; text-transform: uppercase; color: var(--muted); margin: 28px 0 8px; }
p, li { max-width: 68ch; }
p { margin: 0 0 14px; }
em { color: var(--muted); }
h1 + p em { font: 400 15px/1.5 var(--sans); color: var(--muted); }
strong { font-weight: 600; }
a { color: var(--accent); }
code { font: 0.86em var(--mono); background: var(--sheet); border: 1px solid var(--rule); border-radius: 4px; padding: 0 4px; }
ul, ol { padding-left: 1.2em; margin: 0 0 14px; }
li { margin: 4px 0; }
.tablewrap { overflow-x: auto; margin: 6px 0 20px; }
table { border-collapse: collapse; font: 14px/1.45 var(--sans); min-width: 100%; }
th, td { border-bottom: 1px solid var(--rule); padding: 6px 10px; text-align: left; vertical-align: top; font-variant-numeric: tabular-nums; }
th { color: var(--muted); font-weight: 600; font-size: 12.5px; letter-spacing: .03em; }
td.num { white-space: nowrap; font-family: var(--mono); font-size: 13px; }
sub { font-size: 0.72em; }
hr { border: 0; border-top: 1px solid var(--rule); margin: 32px 0; }
.refs li { font-size: 15px; line-height: 1.5; }
@media (max-width: 520px) { body { font-size: 16.5px; } }
"""


def main() -> int:
    text = (HERE / "draft.md").read_text()
    title = re.match(r"# (.+)", text).group(1)
    body = markdown.markdown(text, extensions=["tables", "sane_lists"])
    body = body.replace("<table>", '<div class="tablewrap"><table>').replace("</table>", "</table></div>")
    # Numbers stay on one line; prose cells wrap.
    numeric = re.compile(r"^(?:[+−\-–]?[\d.]+%?(?: \[[^\]]+\])?|–|&gt;\d+)$")
    body = re.sub(r"<td>([^<]*)</td>", lambda m: f'<td class="num">{m.group(1)}</td>' if numeric.match(m.group(1).strip()) else m.group(0), body)
    # Subscripts in the formulae (x_ijt, μ_j, …), outside code.
    parts = re.split(r"(<code>.*?</code>)", body, flags=re.S)
    sub = re.compile(r"(?<![A-Za-z0-9_/])([xzuwμεστσ])_([a-z]{1,3})(?![a-z])")
    body = "".join(part if part.startswith("<code>") else sub.sub(r"\1<sub>\2</sub>", part) for part in parts)
    body = re.sub(r'(<h2[^>]*>References[^<]*</h2>\s*)<ul>', r'\1<ul class="refs">', body)
    page = f"""<title>{html.escape(title)}</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&family=Source+Serif+4:ital,opsz,wght@0,8..60,400;0,8..60,600;1,8..60,400&display=swap">
<style>{CSS}</style>
<main class="page">
<div class="status">Working draft. The design, theory and simulation are done; the pilot's data are not yet in, so every result below is simulated.</div>
{body}
</main>
"""
    (HERE / "draft.html").write_text(page, encoding="utf-8")
    print(f"draft.html: {len(page)} bytes")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
