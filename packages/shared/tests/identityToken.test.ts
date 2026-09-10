/**
 * The signed identity, tested at the edges that decide whether it is worth having (`⚑27`, SOC-2.E).
 *
 * A verifier is only as good as its rejections, so most of this file is about tokens that must NOT
 * verify. The one that would be easy to get wrong and impossible to notice is the length guard:
 * `timingSafeEqual` THROWS when its buffers differ in length rather than returning false, so a
 * hand-made short signature would come back as an exception — a 500 where a 401 belongs, which reads
 * as an outage and gets "fixed" by catching everything.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { bearerToken, signIdentity, verifyIdentity } from "../src/identityToken.js";

const SECRET = "test-secret-aaaa";
const OTHER = "test-secret-bbbb";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556666";
const IAT = 1_757_000_000_000;

test("a signed identity round-trips, and carries the subject it was signed for", () => {
  const token = signIdentity(SUBJECT, SECRET, IAT);
  assert.deepEqual(verifyIdentity(token, [SECRET]), { subject: SUBJECT, issuedAt: IAT });
});

test("signing is a pure function of its inputs, so the same identity is the same token", () => {
  // `issuedAt` is a parameter rather than a Date.now() for exactly this: a test can state the whole
  // token, and two runs of the same mint are comparable.
  assert.equal(signIdentity(SUBJECT, SECRET, IAT), signIdentity(SUBJECT, SECRET, IAT));
  assert.notEqual(signIdentity(SUBJECT, SECRET, IAT), signIdentity(SUBJECT, SECRET, IAT + 1));
});

test("a subject cannot be swapped without the signature noticing", () => {
  // The whole point: the client carries the subject but does not choose it.
  const token = signIdentity(SUBJECT, SECRET, IAT);
  const parts = token.split(".");
  const forged = [parts[0], Buffer.from("someone-else", "utf8").toString("base64url"), parts[2], parts[3]].join(".");
  assert.equal(verifyIdentity(forged, [SECRET]), null);
});

test("the wrong secret does not verify, which is what rotation relies on", () => {
  assert.equal(verifyIdentity(signIdentity(SUBJECT, SECRET, IAT), [OTHER]), null);
});

test("rotation accepts both keys during the overlap, and only the new one after it", () => {
  // C39: an anonymous person holds the only copy of their identity and has nothing to re-present, so
  // replacing the key without an overlap window orphans every one of them at once.
  const old = signIdentity(SUBJECT, SECRET, IAT);
  assert.deepEqual(verifyIdentity(old, [OTHER, SECRET])?.subject, SUBJECT, "the overlap window must accept the outgoing key");
  assert.equal(verifyIdentity(old, [OTHER]), null, "after the window, the outgoing key stops verifying");
});

test("a short or malformed signature is a REJECTION, not an exception", () => {
  // timingSafeEqual throws on unequal lengths. Without the length check before it, this input is a
  // 500 rather than a 401 — and a verifier that can crash is a verifier someone wraps in a catch
  // that swallows real failures too.
  const token = signIdentity(SUBJECT, SECRET, IAT);
  const parts = token.split(".");
  for (const sig of ["", "a", "AAAA", parts[3]!.slice(0, -4), parts[3]! + "AAAA", "!!!not-base64!!!"]) {
    const tampered = [parts[0], parts[1], parts[2], sig].join(".");
    assert.doesNotThrow(() => verifyIdentity(tampered, [SECRET]), `threw on signature ${JSON.stringify(sig)}`);
    assert.equal(verifyIdentity(tampered, [SECRET]), null, `verified a bad signature ${JSON.stringify(sig)}`);
  }
});

test("a token from another format version is rejected rather than mis-parsed", () => {
  const token = signIdentity(SUBJECT, SECRET, IAT);
  assert.equal(verifyIdentity(token.replace(/^v1\./, "v2."), [SECRET]), null);
});

test("nothing shaped wrongly verifies, and none of it throws", () => {
  for (const bad of ["", "   ", "v1", "v1.a", "v1.a.b", "v1.a.b.c.d", "....", SUBJECT, "Bearer x"]) {
    assert.doesNotThrow(() => verifyIdentity(bad, [SECRET]), `threw on ${JSON.stringify(bad)}`);
    assert.equal(verifyIdentity(bad, [SECRET]), null, `verified ${JSON.stringify(bad)}`);
  }
});

test("an empty secret list, or a list of empty secrets, verifies nothing", () => {
  // The production failure this guards: ECHO_IDENTITY_SECRET unset resolves to [""], and a verifier
  // that treated "" as a usable key would accept HMACs anyone could compute.
  const token = signIdentity(SUBJECT, SECRET, IAT);
  assert.equal(verifyIdentity(token, []), null);
  assert.equal(verifyIdentity(token, [""]), null);
  assert.equal(verifyIdentity(token, ["", ""]), null);
});

test("signing refuses the two inputs that would produce a meaningless token", () => {
  assert.throws(() => signIdentity("", SECRET, IAT), /empty subject/);
  assert.throws(() => signIdentity(SUBJECT, "", IAT), /empty secret/);
});

test("a subject with awkward bytes survives the round trip", () => {
  // Subjects are UUIDs today, but the harnesses compose their own ids (cap_tessa, f4sil…_twin) and a
  // transport that mangled one would attribute writes to a subject nobody can read back.
  for (const subject of ["u_abc", "cap_tessa", "you.promise", "a/b+c=d", "tëssa-ünïcode", "x".repeat(300)]) {
    const token = signIdentity(subject, SECRET, IAT);
    assert.equal(verifyIdentity(token, [SECRET])?.subject, subject);
  }
});

test("the bearer header is parsed in one place, tolerantly, and never returns a half-answer", () => {
  assert.equal(bearerToken("Bearer abc"), "abc");
  assert.equal(bearerToken("bearer abc"), "abc", "case is not a credential");
  assert.equal(bearerToken("  Bearer   abc  "), "abc");
  for (const none of [null, undefined, "", "abc", "Basic abc", "Bearer", "Bearer   "]) {
    assert.equal(bearerToken(none), "", `parsed a token out of ${JSON.stringify(none)}`);
  }
});
