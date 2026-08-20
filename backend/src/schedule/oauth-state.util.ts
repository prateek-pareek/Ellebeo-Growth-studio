// oauth-state.util.ts
// The Instagram/Facebook OAuth callback endpoints are necessarily unauthenticated
// (Meta redirects here with no JWT), and they decide which tenant's SocialAccount
// record receives the resulting access token based solely on the `state` param
// round-tripped through Meta. If `state` were plain base64 JSON (as it used to
// be), anyone could forge a state with an arbitrary tenantId and call the
// exchange endpoint directly with their own OAuth code — attaching (or
// overwriting) another tenant's Instagram/Facebook connection with no auth at
// all. Signing state at issuance and verifying the signature before trusting
// its contents closes that off: only the server can mint a state that will be
// accepted back.
import { createHmac, timingSafeEqual } from 'crypto';

function getStateSecret(): string {
  const secret = process.env.JWT_ACCESS_SECRET;
  if (!secret) throw new Error('JWT_ACCESS_SECRET not set — required to sign OAuth state');
  return secret;
}

export function signOAuthState(payload: Record<string, string>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  return `${body}.${signature}`;
}

export function verifyOAuthState<T = Record<string, string>>(state: string): T {
  const [body, signature] = state.split('.');
  if (!body || !signature) throw new Error('Malformed OAuth state');

  const expected = createHmac('sha256', getStateSecret()).update(body).digest('base64url');
  const actualBuf = Buffer.from(signature);
  const expectedBuf = Buffer.from(expected);
  if (actualBuf.length !== expectedBuf.length || !timingSafeEqual(actualBuf, expectedBuf)) {
    throw new Error('Invalid OAuth state signature');
  }

  return JSON.parse(Buffer.from(body, 'base64url').toString()) as T;
}
