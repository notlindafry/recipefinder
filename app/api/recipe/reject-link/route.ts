import { NextRequest, NextResponse } from "next/server";
import { getRecipes, getSheetMeta, invalidateCache } from "@/lib/data";
import { writeEnabled, updateRecipeCell, rejectRecipeLink } from "@/lib/sheets";
import { guard, readJson, clampStr, serverError } from "@/lib/api";
import { sanitizeUrlForSheet } from "@/scripts/lib/url-safety.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const blocked = guard(req, "reject-link", 20, 60 * 1000);
  if (blocked) return blocked;

  if (!writeEnabled()) {
    return NextResponse.json(
      { error: "Saving changes isn't enabled on this server." },
      { status: 503 },
    );
  }

  const body = await readJson(req);
  if (!body) return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });

  const id = Number(body.id);
  if (!Number.isInteger(id) || id < 0) {
    return NextResponse.json({ error: "Invalid recipe id." }, { status: 400 });
  }
  // The URL being rejected originates from the sheet, but re-validate it here
  // since it arrives via the client.
  const url = sanitizeUrlForSheet(clampStr(body.url, 2048));
  if (!url) {
    return NextResponse.json({ error: "Invalid URL to reject." }, { status: 400 });
  }

  try {
    const [recipes, meta] = await Promise.all([getRecipes(), getSheetMeta()]);
    const recipe = recipes.find((r) => r.id === id);
    if (!recipe || !recipe.row) {
      return NextResponse.json({ error: "Recipe not found." }, { status: 404 });
    }
    if (meta.nameCol === null || meta.linkCol === null) {
      return NextResponse.json(
        { error: "Could not locate the recipe-name and link columns in the sheet." },
        { status: 400 },
      );
    }

    // Without a "Rejected links" column there's nowhere to remember the
    // rejection, so just clear the link (preserving the old behaviour) and tell
    // the client it couldn't be persisted.
    if (meta.rejectedLinksCol === null) {
      await updateRecipeCell({
        row: recipe.row,
        nameCol: meta.nameCol,
        expectedName: recipe.name,
        targetCol: meta.linkCol,
        value: "",
      });
      invalidateCache();
      return NextResponse.json({ ok: true, remembered: false });
    }

    await rejectRecipeLink({
      row: recipe.row,
      nameCol: meta.nameCol,
      expectedName: recipe.name,
      linkCol: meta.linkCol,
      rejectedCol: meta.rejectedLinksCol,
      url,
    });
    invalidateCache(); // next find-link reflects the new rejection

    return NextResponse.json({ ok: true, remembered: true });
  } catch (err) {
    // The row-drift safety check is user-actionable; everything else stays generic.
    if (err instanceof Error && err.message.startsWith("Safety check failed")) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    return serverError(err, "Could not reject the link.");
  }
}
