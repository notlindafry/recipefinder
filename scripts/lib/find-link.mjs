// Per-recipe orchestration shared by the CLI (scripts/find-recipe-urls.mjs) and
// the in-app "Find link" button (app/api/recipe/find-link). Given one recipe it
// finds candidate pages, validates each in our own code, and returns the single
// best trusted match — or a status explaining why there wasn't one.

import { findCandidates } from "./find-candidates.mjs";
import { validateUrl } from "./validate-url.mjs";
import { scoreCandidate, pickBest } from "./matching.mjs";
import { sanitizeUrlForSheet } from "./url-safety.mjs";

const MAX_CANDIDATES_PER_RECIPE = 6;

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

/**
 * @param {{name:string, book:string, author:string}} recipe
 * @returns {Promise<{status:"matched"|"no_match"|"no_candidates", url?:string, score?:number}>}
 *          Throws if the search call itself fails (caller decides how to handle).
 */
export async function findBestLink(recipe) {
  const candidates = await findCandidates(recipe);

  // De-dup and cap how many we'll actually fetch/validate.
  const seen = new Set();
  const unique = [];
  for (const c of candidates || []) {
    const key = norm(c.url);
    if (!c.url || seen.has(key)) continue;
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
    const host = new URL(safe).hostname;
    const s = scoreCandidate(host, v.signals);
    if (!s.qualifies) continue;
    finalists.push({ url: safe, ...s });
  }

  const best = pickBest(finalists);
  if (!best) {
    return { status: candidates?.length ? "no_match" : "no_candidates" };
  }
  return { status: "matched", url: best.url, score: best.score };
}
