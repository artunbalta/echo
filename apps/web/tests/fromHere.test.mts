/**
 * "Was this request written by our own page, as JSON?" (`lib/fromHere.ts`, DECISIONS C94): the one rule
 * the routes that take no identity share, so that another site's page cannot make its visitors call them.
 *
 * Run:  node --import tsx --test apps/web/tests/fromHere.test.mts
 */
import test from "node:test";
import assert from "node:assert/strict";

import { fromHere } from "../src/lib/fromHere";

test("a request is from our own page if it is JSON and a browser does not say it came from elsewhere", () => {
  const ask = (headers: Record<string, string>) => fromHere(new Request("https://echovirtualworld.com/api/x", { method: "POST", headers, body: "{}" }));
  assert.equal(ask({ "content-type": "application/json" }), true, "a script with no browser behind it");
  assert.equal(ask({ "content-type": "application/json; charset=utf-8", "sec-fetch-site": "same-origin", origin: "https://echovirtualworld.com", host: "echovirtualworld.com" }), true);
  assert.equal(ask({ "content-type": "application/json", "sec-fetch-site": "none" }), true, "typed into the address bar, or a tool");
  // The three content types a form on another site can send without asking.
  for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"]) assert.equal(ask({ "content-type": type }), false, type);
  assert.equal(ask({}), false);
  assert.equal(ask({ "content-type": "application/json", "sec-fetch-site": "cross-site" }), false);
  assert.equal(ask({ "content-type": "application/json", "sec-fetch-site": "same-site" }), false, "a sibling subdomain is not this page");
  assert.equal(ask({ "content-type": "application/json", origin: "https://elsewhere.example", host: "echovirtualworld.com" }), false);
  assert.equal(ask({ "content-type": "application/json", origin: "null", host: "echovirtualworld.com" }), false, "a sandboxed frame");
  // Behind a proxy the host the browser asked for is the forwarded one.
  assert.equal(ask({ "content-type": "application/json", origin: "https://echovirtualworld.com", host: "internal:3000", "x-forwarded-host": "echovirtualworld.com" }), true);
});
