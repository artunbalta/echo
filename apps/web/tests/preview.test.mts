/**
 * The village opens in turns (DECISIONS C97): who is given a short look and who the village, the
 * link that is a turn, and the language a page is served in.
 *
 * Run:  node --import tsx --test apps/web/tests/preview.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const require_ = createRequire(import.meta.url);
const SERVER_ONLY = require_.resolve("server-only");
require_.cache[SERVER_ONLY] = { id: SERVER_ONLY, filename: SERVER_ONLY, path: SERVER_ONLY, loaded: true, exports: {}, children: [], paths: [] } as never;

const { hasPass, inTurns, isPreview, passDigest, passFor } = await import("../src/lib/previewPass");
const { PREVIEW_MS, PREVIEW_SECONDS } = await import("../src/lib/preview");
const { langOf } = await import("../src/lib/langOf");

const SRC = resolve(dirname(fileURLToPath(import.meta.url)), "../src");
const read = (path: string) => readFileSync(resolve(SRC, path), "utf8");

test("the village opens in turns where it is built for visitors, and is open where it is built for work", () => {
  assert.equal(inTurns({ NODE_ENV: "production" }), true);
  assert.equal(inTurns({ NODE_ENV: "development" }), false);
  assert.equal(inTurns({ NODE_ENV: "test" }), false);
  // The two settings: one opens a production build to everyone, one gives a developer a visitor's look.
  assert.equal(inTurns({ NODE_ENV: "production", ECHO_OPEN: "1" }), false);
  assert.equal(inTurns({ NODE_ENV: "development", ECHO_GATE: "1" }), true);
  assert.equal(inTurns({ NODE_ENV: "production", ECHO_OPEN: "1", ECHO_GATE: "1" }), false);
  assert.equal(inTurns({ NODE_ENV: "production", ECHO_OPEN: "true" }), true);
});

test("a look is thirty seconds, and the page says the number it is", () => {
  assert.equal(PREVIEW_SECONDS, 30);
  assert.equal(PREVIEW_MS, 30_000);
  // Said from the one number, never typed: the landing's link and the footer's.
  assert.match(read("app/_landing/Landing.tsx"), /copy\.peek\(PREVIEW_SECONDS\)/);
  assert.match(read("components/site/SiteFooter.tsx"), /copy\.peek\(PREVIEW_SECONDS\)/);
});

test("a turn is a code on the list: its cookie holds a digest, and taking the code off the list ends it", () => {
  const env = { NODE_ENV: "production", ECHO_PASS: "first-friends, demo-day-2026 ,short" };
  const pass = passFor("first-friends", env);
  assert.ok(pass);
  assert.equal(pass, passDigest("first-friends"));
  assert.ok(!pass.includes("first-friends"));
  assert.equal(passFor("demo-day-2026", env), passDigest("demo-day-2026"));
  // A code that can be guessed is not a turn, on the list or not; neither is one that is not there.
  assert.equal(passFor("short", env), null);
  assert.equal(passFor("someone-else", env), null);
  assert.equal(passFor("", env), null);
  assert.equal(passFor("first-friends", { NODE_ENV: "production" }), null);

  assert.equal(hasPass(pass, env), true);
  assert.equal(hasPass("first-friends", env), false);
  assert.equal(hasPass(undefined, env), false);
  assert.equal(hasPass(pass, { NODE_ENV: "production", ECHO_PASS: "demo-day-2026" }), false);

  assert.equal(isPreview(undefined, env), true);
  assert.equal(isPreview(pass, env), false);
  assert.equal(isPreview(undefined, { NODE_ENV: "development", ECHO_PASS: "first-friends" }), false);
  assert.equal(isPreview(undefined, { NODE_ENV: "production", ECHO_OPEN: "1" }), false);
});

test("a page is served in the language its reader chose, and failing that the first one their browser asks for that we have", () => {
  assert.equal(langOf(undefined, "tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7"), "tr");
  assert.equal(langOf(undefined, "en-GB,en;q=0.9,tr;q=0.8"), "en");
  assert.equal(langOf(undefined, "de-DE,de;q=0.9,tr;q=0.5,en;q=0.4"), "tr");
  assert.equal(langOf(undefined, "de-DE,fr;q=0.9"), "en");
  assert.equal(langOf(undefined, null), "en");
  assert.equal(langOf(undefined, ""), "en");
  // Their own choice here wins over the browser's; anything else in the cookie is not a choice.
  assert.equal(langOf("en", "tr-TR,tr;q=0.9"), "en");
  assert.equal(langOf("tr", "en-GB,en;q=0.9"), "tr");
  assert.equal(langOf("xx", "tr"), "tr");
});

test("the route asks once and hands it down; a look is never asked the question, and ends with the village gone", () => {
  const page = read("app/parcel/[cell]/page.tsx");
  assert.match(page, /isPreview\(\(await cookies\(\)\)\.get\(PASS_COOKIE\)\?\.value\)/);
  assert.match(page, /<ParcelVisit\s+look=\{look\}/);
  // The address that forces a look is a development server's alone.
  assert.match(page, /process\.env\.NODE_ENV !== "production" && query\.look === "1"/);

  const visit = read("components/planet/ParcelVisit.tsx");
  assert.match(visit, /if \(ended\) return <PreviewGate still=\{ended\.still\} \/>;/);

  const canvas = read("components/planet/ParcelCanvas.tsx");
  assert.match(canvas, /consent=\{preview \? "declined" : consent\}/);
  assert.match(canvas, /PREVIEW_MS - \(performance\.now\(\) - shownAt\)/);
  // The pilot's visit and the demo's mount the canvas themselves and pass no look.
  for (const own of ["components/pilot/PilotFlow.tsx", "components/demo/YouDemo.tsx"]) assert.doesNotMatch(read(own), /preview=/);
});

test("the landing's first action is the waitlist, in one face and with no rules between its sections", () => {
  const landing = read("app/_landing/Landing.tsx");
  assert.match(landing, /<WaitlistForm\s+where="landing"/);
  assert.ok(landing.indexOf("<WaitlistForm") < landing.indexOf("OPEN_VILLAGE_PATH} data-walk-in"), "the form stands before the look");
  // What the page is made of, apart from what its comments say went.
  const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(code(landing), /Splash|Lenis|italic|eyebrow/);
  for (const part of ["app/_landing/Section.tsx", "app/_landing/HowItGoes.tsx", "components/site/SiteFooter.tsx"]) {
    assert.doesNotMatch(code(read(part)), /border-[tblr]\b|border-y\b|className="eyebrow|italic/, part);
  }
  // Both builds of the landing are the same page; the Turkish one says which language it was built in.
  assert.match(read("app/page.tsx"), /<Landing \/>/);
  assert.match(read("app/tr/page.tsx"), /<ServedLang lang="tr">[\s\S]*<Landing \/>/);
  assert.match(read("middleware.ts"), /matcher: \["\/"\]/);
});
