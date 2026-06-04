// Best-effort, in-memory fixed-window rate limiter.
//
// NOTE: In serverless (Vercel), each instance has its own memory, so this caps
// abuse per-instance rather than globally. That's adequate as a second layer
// behind the password gate. For strict global limits, back it with a shared
// store (e.g. Upstash Redis / @upstash/ratelimit) — swap the body of rateLimit().

interface Entry {
  count: number;
  reset: number; // epoch ms when the window resets
}

const store = new Map<string, Entry>();

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  reset: number;
  retryAfter: number; // seconds
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
): RateLimitResult {
  const now = Date.now();

  // Opportunistic cleanup so the map can't grow unbounded.
  if (store.size > 5000) {
    for (const [k, v] of store) if (v.reset <= now) store.delete(k);
  }

  let entry = store.get(key);
  if (!entry || entry.reset <= now) {
    entry = { count: 0, reset: now + windowMs };
    store.set(key, entry);
  }
  entry.count += 1;

  const ok = entry.count <= limit;
  return {
    ok,
    remaining: Math.max(0, limit - entry.count),
    reset: entry.reset,
    retryAfter: Math.max(1, Math.ceil((entry.reset - now) / 1000)),
  };
}
