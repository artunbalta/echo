/**
 * The token's shape, read without a key — and the browser state it exists to detect.
 *
 * The defect behind this file: erasing an account removed `echo.userId` and left
 * `echo.identityToken` in place, `resolveUserId` then minted a fresh anonymous id under the dead
 * signature, and `ensureIdentity` short-circuited on "I have both keys" — so every write from that
 * browser was refused with `identity_mismatch`, forever, and no reload healed it. The predicate that
 * makes the short-circuit honest is `tokenMatchesSubject`, and the test that matters is the one
 * where both keys are present and disagree.
 *
 * The parse is deliberately NOT a verifier and the first test says so out loud. If it ever becomes
 * one, this file should be the thing that stops it: a forged token parses here and must.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { parseIdentityToken, tokenMatchesSubject } from "../src/identityFormat.js";
import { signIdentity } from "../src/identityToken.js";

const SECRET = "test-secret-aaaa";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556666";
const OTHER_SUBJECT = "00000000-9999-4888-8777-666655554444";
const IAT = 1_757_000_000_000;

test("a real token parses into the subject and the bytes its signature covers", () => {
  const token = signIdentity(SUBJECT, SECRET, IAT);
  const parsed = parseIdentityToken(token);
  assert.ok(parsed);
  assert.equal(parsed.subject, SUBJECT);
  assert.equal(parsed.issuedAt, IAT);
  // `payload` must be exactly the first three fields: it is what `verifyIdentity` re-signs.
  assert.equal(parsed.payload, token.split(".").slice(0, 3).join("."));
  assert.equal(parsed.signature, token.split(".")[3]);
});

test("THIS PARSE VERIFIES NOTHING, and a forged token proves it", () => {
  // Not a bug to fix. A browser asking "is this a signature over the id beside it" has no key and
  // needs none; the only thing that decides who a request is for is verifyIdentity, on a server.
  // If someone later makes this reject unsigned tokens, they have moved a trust decision into the
  // client, and this assertion is where that shows up.
  const forged = ["v1", Buffer.from(SUBJECT, "utf8").toString("base64url"), IAT.toString(36), "not-a-signature"].join(".");
  const parsed = parseIdentityToken(forged);
  assert.ok(parsed);
  assert.equal(parsed.subject, SUBJECT);
});

test("anything that is not the format is null rather than a guess", () => {
  assert.equal(parseIdentityToken(""), null);
  // THE FIELD COUNT IS TESTED WITH REAL FIELDS, deliberately. "v1.a.b" is rejected whether or not
  // the length check exists — "a" is not decodable base64url, so it dies one line later and the
  // assertion passes for a reason it does not state. Splicing a genuine token's own fields leaves
  // the count as the only thing that can reject them, which is what the assertion claims to test.
  const [v, sub, iat, sig] = signIdentity(SUBJECT, SECRET, IAT).split(".") as [string, string, string, string];
  assert.equal(parseIdentityToken([v, sub, iat].join(".")), null, "three fields is not a token");
  assert.equal(parseIdentityToken([v, sub, iat, sig, sig].join(".")), null, "five fields is not a token");
  // The version prefix exists so a future format is a REJECTION and not a mis-parse.
  const token = signIdentity(SUBJECT, SECRET, IAT);
  assert.equal(parseIdentityToken(`v2${token.slice(2)}`), null, "an unknown version must not parse");
  assert.equal(parseIdentityToken([v, sub, "zzzz!!", sig].join(".")), null, "a non-base36 issuedAt");
  assert.equal(parseIdentityToken([v, "", iat, sig].join(".")), null, "an empty subject");
});

test("a token and the id beside it AGREE, which is the ordinary case", () => {
  assert.equal(tokenMatchesSubject(signIdentity(SUBJECT, SECRET, IAT), SUBJECT), true);
});

test("THE ERASED-BROWSER STATE: both keys present, and they disagree", () => {
  // The exact shape of the bug. `/account`'s erase removed echo.userId and not echo.identityToken,
  // so the next visit holds a fresh id and last life's signature. Before this predicate existed,
  // ensureIdentity saw "an id and a token" and returned early — a permanent identity_mismatch that
  // survived every reload, because the only thing that could have re-minted was the thing that
  // short-circuited.
  const staleToken = signIdentity(OTHER_SUBJECT, SECRET, IAT);
  assert.equal(tokenMatchesSubject(staleToken, SUBJECT), false);
});

test("a missing half is not a match, in either direction", () => {
  assert.equal(tokenMatchesSubject("", SUBJECT), false);
  assert.equal(tokenMatchesSubject(signIdentity(SUBJECT, SECRET, IAT), ""), false);
  assert.equal(tokenMatchesSubject("not-a-token", SUBJECT), false);
});

test("a subject with non-ASCII bytes survives the round trip", () => {
  // The decode is atob + TextDecoder rather than Buffer, so that one parse serves both runtimes.
  // atob alone would return mojibake here; this is the assertion that catches losing the decoder.
  const unicode = "kullanıcı-çğüöşı-🌍";
  assert.equal(parseIdentityToken(signIdentity(unicode, SECRET, IAT))?.subject, unicode);
  assert.equal(tokenMatchesSubject(signIdentity(unicode, SECRET, IAT), unicode), true);
});
