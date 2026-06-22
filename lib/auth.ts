import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "rf_session";
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7; // 7 days (seconds)

/**
 * The signing key, derived from SESSION_SECRET. Returns null if the secret is
 * missing or too short — callers treat that as "auth not configured" and fail
 * closed (no valid sessions can be minted or verified).
 */
function secretKey(): Uint8Array | null {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) return null;
  return new TextEncoder().encode(s);
}

export function authConfigured(): boolean {
  return Boolean(process.env.APP_PASSWORD && secretKey());
}

/** Access tiers carried in the session. "owner" can edit; "guest" is read-only. */
export type Role = "owner" | "guest";

/** Mint a signed session token for a role. Returns null if auth isn't configured. */
export async function createSession(role: Role): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  return new SignJWT({ role })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key);
}

/**
 * Verify a session token and return its role, or null if missing/invalid.
 * Edge-safe (uses Web Crypto via jose). A valid token with no role claim (e.g.
 * one minted before roles existed) is treated as "guest" — least privilege, so
 * a stale owner session can't keep edit access; the owner just logs in again.
 */
export async function getSession(
  token: string | undefined,
): Promise<{ role: Role } | null> {
  const key = secretKey();
  if (!key || !token) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    return { role: payload.role === "owner" ? "owner" : "guest" };
  } catch {
    return null;
  }
}

/** Whether a session token is valid (any role). Used by the middleware gate. */
export async function verifySession(token: string | undefined): Promise<boolean> {
  return (await getSession(token)) !== null;
}
