import { NextRequest, NextResponse } from "next/server";
import { getRecipes } from "@/lib/data";
import { search } from "@/lib/search";
import { guard, parseFilters, readJson, clampStr, serverError } from "@/lib/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_QUERY_LEN = 300;

export async function POST(req: NextRequest) {
  const blocked = guard(req, "search", 30, 60 * 1000);
  if (blocked) return blocked;

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const query = clampStr(body.query, MAX_QUERY_LEN);
  const filters = parseFilters(body.filters);

  try {
    const recipes = await getRecipes(body.refresh === true);
    return NextResponse.json(await search(recipes, query, filters));
  } catch (err) {
    return serverError(err, "Something went wrong loading the catalogue.");
  }
}
