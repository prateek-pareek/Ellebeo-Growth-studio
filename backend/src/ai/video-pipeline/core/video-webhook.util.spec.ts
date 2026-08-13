import { buildVideoWebhookCallbackUrl, isValidVideoWebhookToken } from './video-webhook.util';

describe('video webhook util', () => {
  it('builds a callback URL from API_PUBLIC_URL + secret', () => {
    expect(buildVideoWebhookCallbackUrl({
      API_PUBLIC_URL: 'https://api.example.com/',
      VIDEO_WEBHOOK_SECRET: 's3cret',
    })).toBe('https://api.example.com/api/v1/video/webhook?token=s3cret');
  });

  it('returns undefined when the public URL or secret is missing', () => {
    expect(buildVideoWebhookCallbackUrl({})).toBeUndefined();
  });

  it('rejects a missing or mismatched token', () => {
    const env = { VIDEO_WEBHOOK_SECRET: 's3cret' };
    expect(isValidVideoWebhookToken('s3cret', env)).toBe(true);
    expect(isValidVideoWebhookToken('nope', env)).toBe(false);
    expect(isValidVideoWebhookToken(undefined, env)).toBe(false);
  });
});
