/**
 * The one gate (SOC-2.E, C39), tested the way `test_persistence_gate.py` tests its own:
 * **every strict subset of the conditions stays CLOSED**, because a gate is not a feature whose
 * happy path matters — it is a claim about everything that must not get through.
 *
 * The relaxation exists so the harnesses keep working: they compose their own ids and `?u=` is the
 * only mechanism in the tree that yields two identities in one browser profile. It is two signals,
 * and this file's job is to prove that neither one alone opens it.
 *
 * Run:  cd apps/web && node --import tsx --test tests/subject.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { signIdentity } from "@echo/shared/identity";

import { subjectFor, subjectRejection, trustsAssertedId, type SubjectEnv } from "../src/lib/subject";

const SECRET = "gate-secret-aaaa";
const ROTATED = "gate-secret-bbbb";
const SUBJECT = "ff96e0fc-1111-4222-8333-444455556666";
const IAT = 1_757_000_000_000;

const bearer = (t: string) => `Bearer ${t}`;
const token = signIdentity(SUBJECT, SECRET, IAT);

/** Closed: a real deployment. Neither signal set. */
const closed: SubjectEnv = { secrets: [SECRET] };
/** Open: a developer's machine that opted in explicitly. */
const open: SubjectEnv = { ...closed, trustClientId: "1", vercelEnv: "development" };

test("a verified token names the subject, and that is the whole point", () => {
  assert.deepEqual(subjectFor(closed, bearer(token)), { ok: true, subject: SUBJECT, source: "token" });
});

test("an asserted id may AGREE with the token but never override it", () => {
  // Every existing call site sends both — chain.test.mts pins `/api/agent/persona?uid=u-test` — so
  // agreement has to keep working or the query shapes all have to change at once.
  assert.equal(subjectFor(closed, bearer(token), SUBJECT).ok, true);
  assert.equal(subjectFor(closed, bearer(token), `  ${SUBJECT}  `).ok, true, "whitespace is not a different person");
  assert.deepEqual(subjectFor(closed, bearer(token), "someone-else"), { ok: false, reason: "mismatch" });
});

test("without a token, a production deployment has no subject at all", () => {
  // The hole this closes: `POST /api/observe/behavioral` with a foreign actor_id, and
  // `POST /api/account/delete` with a foreign userId, both of which used to be answered.
  assert.deepEqual(subjectFor(closed, null, "someone-else"), { ok: false, reason: "no-identity" });
  assert.deepEqual(subjectFor(closed, bearer("not-a-token"), "someone-else"), { ok: false, reason: "no-identity" });
});

test("a forged token does not become a subject by being well-shaped", () => {
  const forged = signIdentity("someone-else", "a-secret-nobody-gave-us", IAT);
  assert.deepEqual(subjectFor(closed, bearer(forged)), { ok: false, reason: "no-identity" });
});

test("EVERY STRICT SUBSET OF THE RELAXATION STAYS CLOSED", () => {
  // The flag alone, the environment alone, and each near-miss spelling of the flag.
  const cases: Array<[string, SubjectEnv]> = [
    ["flag alone, on a production Vercel deploy", { ...closed, trustClientId: "1", vercelEnv: "production" }],
    ["flag alone, with NODE_ENV=production", { ...closed, trustClientId: "1", nodeEnv: "production" }],
    ["non-production alone, no flag", { ...closed, vercelEnv: "preview" }],
    ["non-production alone, empty flag", { ...closed, trustClientId: "", vercelEnv: "development" }],
  ];
  for (const [name, env] of cases) {
    assert.equal(trustsAssertedId(env), false, `opened: ${name}`);
    assert.deepEqual(subjectFor(env, null, "someone-else"), { ok: false, reason: "no-identity" }, `opened: ${name}`);
  }
});

test("only the literal \"1\" counts, so no spelling of yes opens the gate", () => {
  for (const flag of ["true", "TRUE", "yes", "on", "0", "1 ", " 1", "01", "1.0", "enabled", " ", "-1"]) {
    const env: SubjectEnv = { ...closed, trustClientId: flag, vercelEnv: "development" };
    assert.equal(trustsAssertedId(env), false, `"${flag}" opened the gate`);
  }
  assert.equal(trustsAssertedId({ ...closed, trustClientId: "1", vercelEnv: "development" }), true);
});

test("with both signals, an asserted id is honoured — which is what the harnesses need", () => {
  // cap_tessa, f4sil…_twin, eight cells per f5 run: ids composed by a script, with no browser to
  // mint them and no key to sign them.
  assert.deepEqual(subjectFor(open, null, "cap_tessa"), { ok: true, subject: "cap_tessa", source: "asserted" });
  assert.deepEqual(subjectFor(open, null, "  you_promise  "), { ok: true, subject: "you_promise", source: "asserted" });
});

test("relaxed still needs SOMETHING: an open gate is not an anonymous subject", () => {
  assert.deepEqual(subjectFor(open, null, ""), { ok: false, reason: "no-identity" });
  assert.deepEqual(subjectFor(open, null, null), { ok: false, reason: "no-identity" });
});

test("a token still wins where one is presented, even in a relaxed environment", () => {
  // Otherwise the harness environment would be a place where the mismatch check silently stops
  // running, and that is where most of the tests live.
  assert.deepEqual(subjectFor(open, bearer(token), "someone-else"), { ok: false, reason: "mismatch" });
  assert.deepEqual(subjectFor(open, bearer(token)), { ok: true, subject: SUBJECT, source: "token" });
});

test("rotation: the outgoing key verifies during the overlap and not after", () => {
  assert.equal(subjectFor({ secrets: [ROTATED, SECRET] }, bearer(token)).ok, true);
  assert.deepEqual(subjectFor({ secrets: [ROTATED] }, bearer(token)), { ok: false, reason: "no-identity" });
});

test("no signing key is the SERVER's fault, and says so instead of blaming the browser", () => {
  // A deployment that forgot ECHO_IDENTITY_SECRET can neither mint nor verify. Reporting
  // "identity_required" would send whoever is debugging it into the client.
  assert.deepEqual(subjectFor({ secrets: [] }, bearer(token), SUBJECT), { ok: false, reason: "unconfigured" });
  assert.deepEqual(subjectFor({ secrets: ["", ""] }, null, SUBJECT), { ok: false, reason: "unconfigured" });
  assert.equal(subjectRejection({ ok: false, reason: "unconfigured" }).status, 503);
});

test("an empty secret is never a usable key", () => {
  // The failure it guards: ECHO_IDENTITY_SECRET unset resolves to "", and an HMAC under the empty
  // key is one anybody can compute.
  const underEmpty = signIdentity(SUBJECT, "x", IAT);
  assert.equal(subjectFor({ secrets: [""] }, bearer(underEmpty)).ok, false);
});

test("a harness with no key at all still runs, because the relaxation does not need one", () => {
  // run_individuation_3d.sh is a zero-key path by design; requiring a secret to run it would make
  // the headline number un-reproducible on a bare laptop.
  assert.deepEqual(subjectFor({ secrets: [], trustClientId: "1", vercelEnv: "development" }, null, "cap_tessa"), {
    ok: true, subject: "cap_tessa", source: "asserted",
  });
});

test("rejections are 403 with a machine-readable reason, never a silent fallback", () => {
  assert.deepEqual(subjectRejection({ ok: false, reason: "no-identity" }), { body: { error: "identity_required" }, status: 403 });
  assert.deepEqual(subjectRejection({ ok: false, reason: "mismatch" }), { body: { error: "identity_mismatch" }, status: 403 });
});
