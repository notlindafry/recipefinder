// Per-recipe orchestration shared by the CLI (scripts/find-recipe-urls.mjs) and
// the in-app "Find link" button (app/api/recipe/find-link). Given one recipe it
// finds candidate pages, validates each in our own code, and returns the single
// best trusted match — or a status explaining why there wasn't one.

import { findCandidates } from "./find-candidates.mjs";
import { validateUrl } from "./validate-url.mjs";
import { scoreCandidate, pickBest } from "./matching.mjs";
import { sanitizeUrlForSheet, canonicalUrlForMatch } from "./url-safety.mjs";

const MAX_CANDIDATES_PER_RECIPE = 6;

// Write policy: "reputable" (default) only auto-fills matches on a recognized
// reputable site or with a strong name+book+author match; "any" writes any safe
// direct match (max coverage). Set RECIPE_LINK_ACCEPT=any to loosen.
const ACCEPT_ANY = process.env.RECIPE_LINK_ACCEPT === "any";

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * @param {{name:string, book:string, author:string}} recipe
 * @param {{excludeUrls?: string[]}} [options] - URLs the user previously rejected
 *        for this recipe; any candidate matching one is skipped (before and after
 *        redirects), so a rejected page is never re-suggested.
 * @returns {Promise<{status:"matched"|"no_match"|"no_candidates", url?:string,
 *          score?:number, usage:{input:number,output:number,searches:number}}>}
 *          Throws if the search call itself fails (caller decides how to handle).
 */
export async function findBestLink(recipe, options = {}) {
  const exclude = new Set(
    (options.excludeUrls || []).map(canonicalUrlForMatch).filter(Boolean),
  );
  const { candidates, usage } = await findCandidates(recipe);

  // De-dup and cap how many we'll actually fetch/validate.
  const seen = new Set();
  const unique = [];
  for (const c of candidates || []) {
    const key = norm(c.url);
    if (!c.url || seen.has(key)) continue;
    if (exclude.has(canonicalUrlForMatch(c.url))) continue; // user rejected this URL before
    seen.add(key);
    unique.push(c);
    if (unique.length >= MAX_CANDIDATES_PER_RECIPE) break;
  }

  const finalists = [];
  for (const c of unique) {
    const reported = {
      name: c.matchesName !== false,
      book: Boolean(c.matchesBook),
      author: Boolean(c.matchesAuthor),
    };
    const v = await validateUrl(c.url, recipe, reported);
    if (!v.accepted) continue;
    const safe = sanitizeUrlForSheet(v.finalUrl || c.url);
    if (!safe) continue;
    if (exclude.has(canonicalUrlForMatch(safe))) continue; // rejected page reached via redirect
    const host = new URL(safe).hostname;
    const s = scoreCandidate(host, v.signals, { acceptAny: ACCEPT_ANY });
    if (!s.qualifies) continue;
    finalists.push({ url: safe, ...s });
  }

  const best = pickBest(finalists);
  if (!best) {
    return { status: candidates?.length ? "no_match" : "no_candidates", usage };
  }
  return { status: "matched", url: best.url, score: best.score, usage };
}
