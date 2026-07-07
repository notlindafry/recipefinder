import { NextRequest, NextResponse } from "next/server";
import { getRecipes, cuisineTaggingAvailable } from "@/lib/data";
import { aiAvailable } from "@/lib/search";
import { writeEnabled } from "@/lib/sheets";
import { guard, serverError, sessionRole } from "@/lib/api";
import type { MetaResponse } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort((a, b) =>
    a.localeCompare(b),
  );
}

export async function GET(req: NextRequest) {
  const blocked = guard(req, "meta", 60, 60 * 1000);
  if (blocked) return blocked;

  // `?refresh=1` bypasses the in-memory sheet cache and re-fetches the CSV, so
  // freshly added rows show up without waiting out SHEET_CACHE_TTL_SECONDS.
  const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1";

  try {
    const [recipes, role] = await Promise.all([
      getRecipes(forceRefresh),
      sessionRole(req),
    ]);
    const meta: MetaResponse = {
      totalRecipes: recipes.length,
      books: sortedUnique(recipes.map((r) => r.book)),
      authors: sortedUnique(recipes.map((r) => r.author)),
      cuisines: sortedUnique(
        recipes.map((r) => r.cuisine ?? "").filter(Boolean),
      ),
      features: {
        ai: aiAvailable(),
        cuisine: cuisineTaggingAvailable,
        writeback: writeEnabled(),
        canEdit: writeEnabled() && role === "owner",
      },
    };
    return NextResponse.json(meta);
  } catch (err) {
    return serverError(err, "Something went wrong loading the catalogue.");
  }
}
