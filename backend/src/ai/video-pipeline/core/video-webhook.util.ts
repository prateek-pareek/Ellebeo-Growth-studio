export function buildVideoWebhookCallbackUrl(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  const base = (env['API_PUBLIC_URL'] ?? '').replace(/\/$/, '');
  const secret = env['VIDEO_WEBHOOK_SECRET'] ?? '';
  if (!base || !secret) return undefined;
  return `${base}/api/v1/video/webhook?token=${encodeURIComponent(secret)}`;
}

export function isValidVideoWebhookToken(
  token: string | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const secret = env['VIDEO_WEBHOOK_SECRET'] ?? '';
  if (!secret) return false;
  return token === secret;
}
