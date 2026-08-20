// Single source of truth for which browser origins may make credentialed
// requests to the API and WebSocket gateways. FRONTEND_URL and ADMIN_PORTAL_URL
// are always set in production (see .github/workflows/production.yml); the
// localhost fallbacks only apply when running locally without a .env.
// ALLOWED_ORIGINS is an optional comma-separated list for any additional origin
// (e.g. a staging domain) beyond those two.
export function getAllowedOrigins(): string[] {
  const extra = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean);

  const frontend = process.env.FRONTEND_URL?.trim() || 'http://localhost:5173';
  const admin = process.env.ADMIN_PORTAL_URL?.trim() || 'http://localhost:3000';

  return Array.from(new Set([frontend, admin, ...extra]));
}

// Requests with no Origin header (native mobile apps, server-to-server calls,
// curl, health checks) aren't subject to CORS in the first place — only a
// browser sends/enforces the Origin header — so they're allowed through here
// and it's the whitelist below that does the actual gatekeeping for browsers.
export function isOriginAllowed(origin: string | undefined | null): boolean {
  if (!origin) return true;
  return getAllowedOrigins().includes(origin);
}
