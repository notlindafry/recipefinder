import { NextRequest, NextResponse } from "next/server";
import { getRecipes } from "@/lib/data";
import { planMenu } from "@/lib/search";
import { guard, parseFilters, readJson, clampStr, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 300;

export async function POST(req: NextRequest) {
  // AI + costly, so a tighter rate limit than search.
  const blocked = guard(req, "menu", 10, 60 * 1000);
  if (blocked) return blocked;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const query = clampStr(body.query, MAX_QUERY_LEN);
  const filters = parseFilters(body.filters);

  try {
    const recipes = await getRecipes();
    return NextResponse.json(await planMenu(recipes, query, filters));
  } catch (err) {
    return serverError(err, "Something went wrong loading the catalogue.");
  }
}
