#!/usr/bin/env node
// Find online versions of the recipes in your catalogue and write the URLs back
// to a dedicated column in your Google Sheet. Run it occasionally — e.g. after
// you add a newly-purchased cookbook's recipes.
//
// What it does, per un-linked recipe:
//   1. Asks Claude to search ONLY a curated allowlist of reputable recipe sites
//      for the SAME recipe (matching recipe name + book title, and/or recipe
//      name + author name) — not just any dish with the same name.
//   2. Independently validates each candidate URL in our own code: it must be a
//      trusted https host, reachable, not a 404 / placeholder / disallowed
//      paywall, and the page must actually be that recipe.
//   3. Picks the most reputable site with the strongest matching signals and
//      writes its URL into the target column.
//
// It never re-queries a recipe that already has a URL in the target column, so
// re-runs are cheap and idempotent.
//
// Usage:
//   node scripts/find-recipe-urls.mjs [--dry-run] [--limit N] [--book "Soup Book"]
//
// Required env: ANTHROPIC_API_KEY and the Google service-account write-back vars
// (GOOGLE_SERVICE_ACCOUNT_EMAIL, GOOGLE_PRIVATE_KEY, SHEET_ID, SHEET_TAB_NAME).
// Optional env: RECIPE_URL_COLUMN (target column header; default: the sheet's
// existing recipe-link column), ANTHROPIC_MODEL.

import {
  requireSheetEnv,
  readSheet,
  writeHeaderCell,
  batchWriteColumn,
  columnLetter,
} from "./lib/sheets.mjs";
import { findCandidates } from "./lib/find-candidates.mjs";
import { validateUrl } from "./lib/validate-url.mjs";
import { scoreCandidate, pickBest } from "./lib/matching.mjs";
import { sanitizeUrlForSheet } from "./lib/url-safety.mjs";

const DEFAULT_LIMIT = 100; // cost guardrail; raise with --limit (0 = no cap)
const CONCURRENCY = 3;
const MAX_CANDIDATES_PER_RECIPE = 6;

function parseArgs(argv) {
  const args = { dryRun: false, limit: DEFAULT_LIMIT, book: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--limit") args.limit = Number(argv[++i]);
    else if (a === "--book") args.book = String(argv[++i] || "").trim();
    else if (a.startsWith("--limit=")) args.limit = Number(a.split("=")[1]);
    else if (a.startsWith("--book=")) args.book = a.split("=").slice(1).join("=").trim();
  }
  if (!Number.isFinite(args.limit) || args.limit < 0) args.limit = DEFAULT_LIMIT;
  return args;
}

const norm = (s) => String(s || "").toLowerCase().replace(/\s+/g, " ").trim();

function classifyHeader(raw) {
  const h = norm(raw);
  if (h.includes("book")) return "book";
  if (h.includes("author")) return "author";
  if (h.includes("recipe name") || h === "name" || h === "recipe") return "name";
  if (h.includes("link") || h.includes("url")) return "link";
  return null;
}

/** Locate book/author/name/link columns and the write target column. */
function resolveColumns(header) {
  const cols = { book: -1, author: -1, name: -1, link: -1 };
  header.forEach((raw, i) => {
    const f = classifyHeader(raw);
    if (f && cols[f] === -1) cols[f] = i;
  });

  const envCol = (process.env.RECIPE_URL_COLUMN || "").trim();
  let targetCol = -1;
  let createHeaderAs = null;
  if (envCol) {
    targetCol = header.findIndex((h) => norm(h) === norm(envCol));
    if (targetCol === -1) {
      targetCol = header.length; // append a new dedicated column on the right
      createHeaderAs = envCol;
    }
  } else {
    targetCol = cols.link;
  }
  return { cols, targetCol, createHeaderAs };
}

async function runPool(items, worker, concurrency) {
  let next = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      await worker(items[i], i);
    }
  });
  await Promise.all(runners);
}

// A misconfigured key or missing web-search entitlement would fail on every
// recipe — surface it immediately rather than churning through the whole list.
function isFatalApiError(err) {
  return err?.status === 401 || err?.status === 403;
}

async function processRecipe(recipe) {
  let candidates;
  try {
    candidates = await findCandidates(recipe);
  } catch (err) {
    if (isFatalApiError(err)) throw err; // abort the run
    return { status: "error", reason: err?.message || "search failed" };
  }

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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  requireSheetEnv();
  if (
    !(process.env.ANTHROPIC_API_KEY || process.env.CLAUDE_API_KEY || process.env.claude_api_key)
  ) {
    throw new Error("Set ANTHROPIC_API_KEY (or CLAUDE_API_KEY).");
  }

  console.log("Reading sheet…");
  const rows = await readSheet();
  if (rows.length < 2) throw new Error("Sheet appears empty (no data rows).");
  const header = rows[0];

  const { cols, targetCol, createHeaderAs } = resolveColumns(header);
  if (cols.name === -1) throw new Error("Could not find a 'Recipe name' column.");
  if (cols.book === -1 && cols.author === -1) {
    throw new Error("Could not find a 'Book' or 'Author' column to match against.");
  }
  if (targetCol === -1) {
    throw new Error(
      "No recipe-link column found. Set RECIPE_URL_COLUMN to the exact header of the column to write URLs into.",
    );
  }
  console.log(
    `Target column: ${columnLetter(targetCol)}` +
      (createHeaderAs ? ` (will create header "${createHeaderAs}")` : ` ("${header[targetCol]}")`),
  );

  // Build the worklist: rows with a name, a book or author, and an EMPTY target
  // cell (we never re-query entries that already have a linked recipe).
  const work = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    const recipe = {
      name: (row[cols.name] || "").trim(),
      book: cols.book >= 0 ? (row[cols.book] || "").trim() : "",
      author: cols.author >= 0 ? (row[cols.author] || "").trim() : "",
    };
    if (!recipe.name) continue;
    if (!recipe.book && !recipe.author) continue;
    if ((row[targetCol] || "").trim()) continue; // already linked → skip
    if (args.book && !norm(recipe.book).includes(norm(args.book))) continue;
    work.push({ rowNumber: r + 1, recipe }); // 1-based sheet row
  }

  const eligible = work.length;
  const limited = args.limit > 0 ? work.slice(0, args.limit) : work;
  console.log(
    `${eligible} un-linked recipe(s) eligible; processing ${limited.length}` +
      `${args.dryRun ? " (dry run, no writes)" : ""}.`,
  );
  if (limited.length === 0) return;

  const summary = { matched: 0, no_match: 0, no_candidates: 0, error: 0 };
  const updates = [];

  await runPool(
    limited,
    async ({ rowNumber, recipe }) => {
      const res = await processRecipe(recipe);
      summary[res.status] = (summary[res.status] || 0) + 1;
      if (res.status === "matched") {
        updates.push({ row: rowNumber, value: res.url, name: recipe.name });
        console.log(`✓ row ${rowNumber}  ${recipe.name} → ${res.url}`);
      } else {
        const why = res.reason ? ` (${res.reason})` : "";
        console.log(`· row ${rowNumber}  ${recipe.name} — ${res.status}${why}`);
      }
    },
    CONCURRENCY,
  );

  console.log(
    `\nResults: ${summary.matched} matched, ${summary.no_match} no-match, ` +
      `${summary.no_candidates} no-candidates, ${summary.error} error.`,
  );

  if (args.dryRun) {
    console.log("Dry run — no changes written.");
    return;
  }
  if (updates.length === 0) {
    console.log("Nothing to write.");
    return;
  }

  // Create the dedicated column header if we're appending a new one.
  if (createHeaderAs) await writeHeaderCell(targetCol, createHeaderAs);

  // Safety re-check: re-read the name + target columns and only write rows whose
  // recipe name is unchanged and whose target cell is still empty, so a
  // concurrent edit between read and write can never overwrite the wrong cell.
  const fresh = await readSheet();
  const safeUpdates = updates.filter(({ row, name }) => {
    const live = fresh[row - 1];
    if (!live) return false;
    const liveName = norm(live[cols.name] || "");
    const liveTarget = (live[targetCol] || "").trim();
    return liveName === norm(name) && !liveTarget;
  });
  const skipped = updates.length - safeUpdates.length;

  await batchWriteColumn(
    targetCol,
    safeUpdates.map(({ row, value }) => ({ row, value })),
  );
  console.log(
    `Wrote ${safeUpdates.length} URL(s) to column ${columnLetter(targetCol)}.` +
      (skipped ? ` Skipped ${skipped} (changed since read).` : ""),
  );
}

main().catch((err) => {
  console.error(`\nError: ${err?.message || err}`);
  process.exit(1);
});
