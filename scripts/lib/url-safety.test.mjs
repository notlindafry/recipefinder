import { test } from "node:test";
import assert from "node:assert/strict";
import { canonicalUrlForMatch } from "./url-safety.mjs";

// canonicalUrlForMatch decides whether two URLs point at the "same page" so a
// previously rejected URL is recognized among freshly proposed candidates.

test("ignores scheme, trailing slash, fragment, and query", () => {
  const base = canonicalUrlForMatch("https://example.com/recipes/soup");
  assert.equal(canonicalUrlForMatch("http://example.com/recipes/soup/"), base);
  assert.equal(canonicalUrlForMatch("https://example.com/recipes/soup#ingredients"), base);
  assert.equal(canonicalUrlForMatch("https://example.com/recipes/soup?utm_source=x"), base);
});

test("ignores a leading www. and is case-insensitive on the host", () => {
  const base = canonicalUrlForMatch("https://example.com/recipes/soup");
  assert.equal(canonicalUrlForMatch("https://www.example.com/recipes/soup"), base);
  assert.equal(canonicalUrlForMatch("https://EXAMPLE.com/recipes/soup"), base);
});

test("treats different hosts or paths as distinct", () => {
  const base = canonicalUrlForMatch("https://example.com/recipes/soup");
  assert.notEqual(canonicalUrlForMatch("https://example.com/recipes/stew"), base);
  assert.notEqual(canonicalUrlForMatch("https://other.com/recipes/soup"), base);
  // A bare subdomain is its own host (not stripped like www.).
  assert.notEqual(canonicalUrlForMatch("https://app.example.com/recipes/soup"), base);
});

test("returns empty string for blank/invalid input", () => {
  assert.equal(canonicalUrlForMatch(""), "");
  assert.equal(canonicalUrlForMatch(null), "");
  assert.equal(canonicalUrlForMatch(undefined), "");
});
