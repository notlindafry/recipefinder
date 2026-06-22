import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "./ratelimit";
import { clientIp, sameOrigin } from "./http";
import { getSession, SESSION_COOKIE, type Role } from "./auth";
import type { UiFilters } from "./types";

const MAX_FILTER_VALUES = 60;
const STR_MAX = 120;

export function clampStr(v: unknown, max = STR_MAX): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

function strList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value
    .filter((v): v is string => typeof v === "string")
    .map((v) => v.slice(0, STR_MAX))
    .slice(0, MAX_FILTER_VALUES);
  return out.length ? out : undefined;
}

export function parseFilters(raw: unknown): UiFilters {
  const f = (raw ?? {}) as Record<string, unknown>;
  return {
    categories: strList(f.categories),
    ingredients: strList(f.ingredients),
    triedTags: strList(f.triedTags),
    books: strList(f.books),
    authors: strList(f.authors),
    excludeIngredients: strList(f.excludeIngredients),
    cuisines: strList(f.cuisines),
    untriedOnly: f.untriedOnly === true,
    hasLink: f.hasLink === true,
  };
}

/**
 * Same-origin (CSRF) + per-IP rate-limit guard for state-changing endpoints.
 * Returns an error response to short-circuit, or null to proceed.
 */
export function guard(
  req: NextRequest,
  bucket: string,
  limit: number,
  windowMs: number,
): NextResponse | null {
  if (!sameOrigin(req)) {
    return NextResponse.json({ error: "Bad origin." }, { status: 403 });
  }
  const rl = rateLimit(`${bucket}:${clientIp(req)}`, limit, windowMs);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many requests. Please slow down." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  return null;
}

/**
 * Log the real error server-side and return a generic message to the client,
 * so internal details (sheet URLs, upstream HTTP statuses) don't leak.
 */
export function serverError(err: unknown, message: string): NextResponse {
  console.error(err);
  return NextResponse.json({ error: message }, { status: 500 });
}

/**
 * The role of the request's session, or null when there's no valid session.
 * (Routes are already behind the auth middleware, so null here means the cookie
 * was stripped or expired between the middleware check and the handler.)
 */
export async function sessionRole(req: NextRequest): Promise<Role | null> {
  const session = await getSession(req.cookies.get(SESSION_COOKIE)?.value);
  return session?.role ?? null;
}

export async function readJson(
  req: NextRequest,
): Promise<Record<string, unknown> | null> {
  try {
    const body = await req.json();
    return body && typeof body === "object"
      ? (body as Record<string, unknown>)
      : {};
  } catch {
    return null;
  }
}
