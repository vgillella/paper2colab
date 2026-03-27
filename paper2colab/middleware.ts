import { NextRequest, NextResponse } from 'next/server';

// ── Sliding-window rate limiter ────────────────────────────────────────────────
// In-memory store: IP → sorted array of request timestamps (ms)
const WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS = 3;

// eslint-disable-next-line no-var
declare var globalThis: { _rateLimitStore?: Map<string, number[]> };

// Survive hot-reload in dev by attaching to globalThis
function getStore(): Map<string, number[]> {
  if (!globalThis._rateLimitStore) {
    globalThis._rateLimitStore = new Map();
  }
  return globalThis._rateLimitStore;
}

function getClientIp(req: NextRequest): string {
  const xff = req.headers.get('x-forwarded-for');
  if (xff) return xff.split(',')[0].trim();
  return req.headers.get('x-real-ip') ?? '127.0.0.1';
}

// ── Matcher ───────────────────────────────────────────────────────────────────
export const config = {
  matcher: '/api/generate',
};

export function middleware(req: NextRequest) {
  // Only rate-limit POST requests to /api/generate
  if (req.method !== 'POST') return NextResponse.next();

  const ip = getClientIp(req);

  // Loopback addresses are always trusted (internal/dev traffic)
  if (ip === '127.0.0.1' || ip === '::1' || ip.startsWith('::ffff:127.')) {
    return NextResponse.next();
  }
  const now = Date.now();
  const store = getStore();

  const timestamps = (store.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
  timestamps.push(now);
  store.set(ip, timestamps);

  if (timestamps.length > MAX_REQUESTS) {
    const oldest = timestamps[0];
    const retryAfter = Math.ceil((WINDOW_MS - (now - oldest)) / 1000); // seconds

    return NextResponse.json(
      { error: 'Too many requests. Please try again later.', retryAfter },
      {
        status: 429,
        headers: { 'Retry-After': String(retryAfter) },
      }
    );
  }

  return NextResponse.next();
}
