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

/** Mint a signed session token. Returns null if auth isn't configured. */
export async function createSession(): Promise<string | null> {
  const key = secretKey();
  if (!key) return null;
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE}s`)
    .sign(key);
}

/** Verify a session token. Edge-safe (uses Web Crypto via jose). */
export async function verifySession(token: string | undefined): Promise<boolean> {
  const key = secretKey();
  if (!key || !token) return false;
  try {
    await jwtVerify(token, key, { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}
