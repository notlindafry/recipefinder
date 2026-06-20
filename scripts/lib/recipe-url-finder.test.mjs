import { test } from "node:test";
import assert from "node:assert/strict";

import {
  isTrustedDomain,
  isAllowedPaywall,
  reputationTier,
  allowedSearchDomains,
  TIER,
} from "./trusted-sites.mjs";
import {
  parseHttpsUrl,
  isFetchableTrustedUrl,
  sanitizeUrlForSheet,
  isPrivateHost,
} from "./url-safety.mjs";
import {
  normalize,
  nameMatchStrength,
  softContains,
  scoreCandidate,
  pickBest,
} from "./matching.mjs";

// --- trusted-sites -------------------------------------------------------

test("allowlist matches sites and sub-domains, rejects everything else", () => {
  assert.equal(isTrustedDomain("epicurious.com"), true);
  assert.equal(isTrustedDomain("www.epicurious.com"), true);
  assert.equal(isTrustedDomain("cooking.nytimes.com"), true);
  assert.equal(isTrustedDomain("evil.com"), false);
  // suffix look-alike must not pass
  assert.equal(isTrustedDomain("notepicurious.com"), false);
  assert.equal(isTrustedDomain("epicurious.com.evil.com"), false);
});

test("only subscribed sites count as allowed paywalls", () => {
  assert.equal(isAllowedPaywall("cooking.nytimes.com"), true);
  assert.equal(isAllowedPaywall("www.nytimes.com"), true);
  assert.equal(isAllowedPaywall("americastestkitchen.com"), true);
  assert.equal(isAllowedPaywall("epicurious.com"), true);
  assert.equal(isAllowedPaywall("seriouseats.com"), false);
  assert.equal(isAllowedPaywall("foodnetwork.com"), false);
});

test("reputation tiers and search domains", () => {
  assert.equal(reputationTier("cooking.nytimes.com"), TIER.TOP);
  assert.equal(reputationTier("budgetbytes.com"), TIER.GOOD);
  assert.equal(reputationTier("evil.com"), 0);
  assert.ok(allowedSearchDomains().includes("epicurious.com"));
});

// --- url-safety ----------------------------------------------------------

test("parseHttpsUrl accepts only safe public https URLs", () => {
  assert.ok(parseHttpsUrl("https://www.epicurious.com/recipes/food/views/x"));
  assert.equal(parseHttpsUrl("http://epicurious.com"), null); // not https
  assert.equal(parseHttpsUrl("javascript:alert(1)"), null);
  assert.equal(parseHttpsUrl("data:text/html,hi"), null);
  assert.equal(parseHttpsUrl("https://user:pass@epicurious.com"), null); // creds
  assert.equal(parseHttpsUrl("https://epicurious.com:8080"), null); // odd port
  assert.equal(parseHttpsUrl("https://127.0.0.1/x"), null); // IP literal
  assert.equal(parseHttpsUrl("https://[::1]/x"), null); // IPv6 literal
  assert.equal(parseHttpsUrl("https://localhost/x"), null); // private host
});

test("isFetchableTrustedUrl couples https-safety with the allowlist", () => {
  assert.equal(isFetchableTrustedUrl("https://www.seriouseats.com/recipe"), true);
  assert.equal(isFetchableTrustedUrl("https://evil.com/recipe"), false);
  assert.equal(isFetchableTrustedUrl("http://www.seriouseats.com/recipe"), false);
});

test("sanitizeUrlForSheet returns a clean trusted URL or null", () => {
  assert.equal(
    sanitizeUrlForSheet("https://food52.com/recipes/1-x#comments"),
    "https://food52.com/recipes/1-x",
  );
  assert.equal(sanitizeUrlForSheet("https://evil.com/x"), null);
  assert.equal(sanitizeUrlForSheet("=HYPERLINK(1)"), null);
});

test("isPrivateHost blocks loopback/private/metadata ranges", () => {
  assert.equal(isPrivateHost("localhost"), true);
  assert.equal(isPrivateHost("127.0.0.1"), true);
  assert.equal(isPrivateHost("10.0.0.5"), true);
  assert.equal(isPrivateHost("192.168.1.1"), true);
  assert.equal(isPrivateHost("169.254.169.254"), true); // cloud metadata
  assert.equal(isPrivateHost("172.16.0.1"), true);
  assert.equal(isPrivateHost("example.com"), false);
});

// --- matching ------------------------------------------------------------

test("normalize folds accents and punctuation", () => {
  assert.equal(normalize("Pâté de Campagne!"), "pate de campagne");
});

test("nameMatchStrength is strict about partial names", () => {
  assert.equal(
    nameMatchStrength("The Best Chicken Noodle Soup Recipe", "Chicken Noodle Soup"),
    "exact",
  );
  // missing a distinctive word ("noodle") must not match
  assert.equal(nameMatchStrength("Chicken Soup", "Chicken Noodle Soup"), "none");
  assert.equal(
    nameMatchStrength("Country Pâté (Pâté de Campagne)", "Pate de Campagne"),
    "exact",
  );
  assert.equal(nameMatchStrength("Beef Stew", "Chicken Noodle Soup"), "none");
});

test("softContains finds an author surname in a credit line", () => {
  assert.equal(softContains("Adapted from Soup Book by Joe Smith", "Joe Smith"), true);
  assert.equal(softContains("A generic page", "Joe Smith"), false);
});

test("scoreCandidate requires name AND (book OR author)", () => {
  const base = { contentVerified: true, structuredRecipe: false };
  assert.equal(
    scoreCandidate("epicurious.com", { name: "exact", book: true, author: false, ...base }).qualifies,
    true,
  );
  assert.equal(
    scoreCandidate("epicurious.com", { name: "exact", book: false, author: false, ...base }).qualifies,
    false,
  );
  assert.equal(
    scoreCandidate("epicurious.com", { name: "none", book: true, author: true, ...base }).qualifies,
    false,
  );
});

test("pickBest prefers strongest signals, then reputation", () => {
  const a = { url: "a", score: 9, reputation: TIER.STRONG, signalScore: 4, qualifies: true };
  const b = { url: "b", score: 11, reputation: TIER.GOOD, signalScore: 5, qualifies: true };
  assert.equal(pickBest([a, b]).url, "b"); // higher score wins

  const c = { url: "c", score: 10, reputation: TIER.TOP, signalScore: 4, qualifies: true };
  const d = { url: "d", score: 10, reputation: TIER.GOOD, signalScore: 4, qualifies: true };
  assert.equal(pickBest([c, d]).url, "c"); // tie on score → reputation

  assert.equal(pickBest([{ url: "x", qualifies: false, score: 99 }]), null);
});
