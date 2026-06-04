import { NextRequest, NextResponse } from "next/server";
import { getRecipes } from "@/lib/data";
import { search } from "@/lib/search";
import type { UiFilters } from "@/lib/types";
import { rateLimit } from "@/lib/ratelimit";
import { clientIp, sameOrigin } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 300;
const MAX_FILTER_VALUES = 50;

function sanitizeFilterList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .filter((v): v is string => typeof v === "string")
    .slice(0, MAX_FILTER_VALUES);
}

export async function POST(req: NextRequest) {
  // Auth is enforced by middleware; these are defense-in-depth against abuse.
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const ip = clientIp(req);
  const limit = rateLimit(`search:${ip}`, 30, 60 * 1000);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "You're searching too fast. Please slow down a moment." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfter) } },
    );
  }

  let body: { query?: unknown; filters?: unknown; refresh?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const query =
    typeof body.query === "string" ? body.query.slice(0, MAX_QUERY_LEN) : "";
  const rawFilters = (body.filters ?? {}) as Record<string, unknown>;
  const filters: UiFilters = {
    categories: sanitizeFilterList(rawFilters.categories),
    ingredients: sanitizeFilterList(rawFilters.ingredients),
    triedTags: sanitizeFilterList(rawFilters.triedTags),
  };

  try {
    const recipes = await getRecipes(Boolean(body.refresh));
    const response = await search(recipes, query, filters);
    return NextResponse.json(response);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Something went wrong loading the catalogue.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
