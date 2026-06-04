import type { NextRequest } from "next/server";

/** Best-effort client IP, trusting Vercel's proxy headers. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return req.headers.get("x-real-ip") || "unknown";
}

/**
 * CSRF defense for state-changing POSTs: require the browser-sent Origin (or
 * Referer) to match the request host. A missing Origin/Referer is allowed
 * (non-browser clients can't mount a CSRF attack and don't carry the cookie
 * cross-site under SameSite=Lax anyway).
 */
export function sameOrigin(req: NextRequest): boolean {
  const host = req.headers.get("host");
  if (!host) return false;

  const origin = req.headers.get("origin");
  if (origin) {
    try {
      return new URL(origin).host === host;
    } catch {
      return false;
    }
  }

  const referer = req.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).host === host;
    } catch {
      return false;
    }
  }

  return true;
}
