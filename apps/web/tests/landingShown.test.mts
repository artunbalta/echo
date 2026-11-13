/**
 * The landing shows what it used to say (DECISIONS C100): the film in its frame, how it works by doing
 * it once, and the thirteen twins drawn where they scored.
 *
 * What is held here is what could go wrong without anyone seeing it: a number typed where it should be
 * counted, a picture that says more than the record does, a toy that keeps what is chosen in it, a film
 * that asks someone else for its letters.
 *
 * Run:  node --import tsx --test apps/web/tests/landingShown.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const WEB = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path: string) => readFileSync(resolve(WEB, path), "utf8");
/** A file's code, apart from what its comments say. */
const code = (path: string) => read(path).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

interface Twin {
  accuracy: number;
  crowd: number;
  retest: number;
  with_one_look: number;
  vs_crowd_ci95: number[];
  one_look_gain_ci95: number[];
}
const audit = JSON.parse(read("src/lib/knowable/data/twin2k-audit.json")) as { people: number; items: number; twins: Record<string, Twin> };
const twins = Object.values(audit.twins);

test("the finding's numbers are counted from the audit's record, and the picture says no more than the record does", () => {
  const src = code("src/app/_landing/Evidence.tsx");
  // Counted: how many twins there are is nowhere in the file as a figure.
  assert.match(src, /import audit from "@\/lib\/knowable\/data\/twin2k-audit\.json"/);
  assert.doesNotMatch(src, /\b1[0-9] (of|twins|published)\b|["`'>]\s*13\b/, "a count of twins is typed");
  assert.doesNotMatch(src, /2,058|2\.058|\b122\b/, "the panel's size is typed");
  // What the three counts are, as the page computes them, on the record as it stands.
  const below = twins.filter((t) => t.vs_crowd_ci95[1]! < 0).length;
  const lifted = twins.filter((t) => t.one_look_gain_ci95[0]! > 0).length;
  const past = twins.filter((t) => t.with_one_look > t.retest).length;
  assert.match(src, /vs_crowd_ci95\[1\]! < 0/);
  assert.match(src, /one_look_gain_ci95\[0\]! > 0/);
  assert.match(src, /with_one_look > t\.retest/);
  // The picture: every released twin is drawn left of its line and every one-look twin right of it,
  // which is true of every one of them, and all of it is inside the axis.
  const axis = /const LO = ([\d.]+);\s*const HI = ([\d.]+);/.exec(src);
  assert.ok(axis, "the axis's two ends");
  const [lo, hi] = [Number(axis[1]), Number(axis[2])];
  for (const [name, t] of Object.entries(audit.twins)) {
    assert.ok(t.accuracy > lo && t.with_one_look < hi, `${name} is off the axis`);
    if (below === twins.length) assert.ok(t.accuracy < t.crowd, `${name} is not below the crowd`);
    if (past === twins.length) assert.ok(t.with_one_look > t.retest && t.with_one_look > t.crowd, `${name} is not past the retest`);
  }
  // One line stands for thirteen crowds: they must agree to within what the eye can see (half a hundredth of the axis's 0.18).
  const crowds = twins.map((t) => t.crowd);
  assert.ok(Math.max(...crowds) - Math.min(...crowds) < 0.01, "the crowd's line is not one line");
  assert.equal(lifted, twins.length, "the page says one look lifted every one");
  // The two series' colours are the pair that passed the validator on this band's surface, and words do not wear them.
  assert.match(src, /const ALONE = "#c9832f";\s*const LOOKED = "#a06cd5";/);
  assert.doesNotMatch(src, /style=\{\{ color: (ALONE|LOOKED)/);
  // The same numbers without the picture: a table, in a box that hides it from the eye only.
  assert.match(src, /<div className="sr-only">\s*<table>/);
});

test("trying one keeps nothing and calls from the one thing it saw", () => {
  const src = code("src/app/_landing/TryOne.tsx");
  assert.doesNotMatch(src, /fetch\(|sendBeacon|XMLHttpRequest|step\(|localStorage|sessionStorage|cookie/, "the page's toy talks to something");
  assert.match(src, /const callFrom = \(first: First\): "one" \| "three" => \(first === "take" \? "three" : "one"\);/);
  // The card says whether the call was right by comparing it with what was done, nothing else.
  assert.match(src, /second === called \? copy\.right : copy\.wrong/);
  // Both languages say every line.
  for (const lang of ["en", "tr"]) assert.match(src, new RegExp(`${lang}: \\{\\s*title:`));
});

test("the film is the site's own file: its letters beside it, its language the page's, its last button the waitlist", () => {
  const film = read("public/film/echo-calls-it.html");
  assert.doesNotMatch(film, /fonts\.googleapis|fonts\.gstatic|<script[^>]+src=|<link[^>]+href="http/, "the film asks someone else for something");
  for (const f of ["jersey15-latin", "jersey15-latin-ext", "pixelifysans-latin", "pixelifysans-latin-ext"]) {
    assert.match(film, new RegExp(`url\\(fonts/${f}\\.woff2\\)`));
    assert.ok(existsSync(resolve(WEB, `public/film/fonts/${f}.woff2`)) && statSync(resolve(WEB, `public/film/fonts/${f}.woff2`)).size > 2000, f);
  }
  assert.match(film, /lang = Q\.get\('lang'\) \|\| 'en'/);
  assert.doesNotMatch(film, /navigator\.language/);
  assert.match(film, /<a id="walk" href="\/#waitlist" target="_top"/);
  const frame = code("src/app/_landing/Film.tsx");
  assert.match(frame, /src=\{`\/film\/echo-calls-it\.html\?lang=\$\{lang\}`\}/);
  assert.match(frame, /loading="lazy"/);
});

test("the page is in two voices, drawn in the film's pixels, and still for whoever asked for less motion", () => {
  const layout = code("src/app/layout.tsx");
  assert.match(layout, /Jersey_15\(\{\s*subsets: \["latin", "latin-ext"\]/);
  const css = read("src/app/globals.css");
  assert.match(css, /\.font-display \{ font-family: var\(--font-display\)/);
  // The order of the page, and its headline in the pixel face.
  const landing = code("src/app/_landing/Landing.tsx");
  const order = ["<Film />", "<TryOne />", "<Evidence />", "<CharacterSelect />", "<Closing />"].map((tag) => landing.indexOf(tag));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1]!)), `sections out of order: ${order.join(", ")}`);
  assert.match(landing, /<h1 className="hero-title font-display /);
  // A scene that moves only while it is looked at, and not at all for someone who asked.
  const scene = code("src/app/_landing/PixelScene.tsx");
  assert.match(scene, /prefers-reduced-motion: reduce/);
  assert.match(scene, /if \(!still\) raf = requestAnimationFrame\(loop\)/);
  assert.match(scene, /IntersectionObserver/);
  for (const rule of [".says, .scene-in { animation: none; }", ".twin-line, .twin-mark { transition: none; }", ".hero-words > * { animation: none; }"]) assert.ok(css.includes(rule), rule);
});
