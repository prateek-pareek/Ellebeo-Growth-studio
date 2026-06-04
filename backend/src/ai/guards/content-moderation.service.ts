// ============================================================================
// content-moderation.service.ts — Image safety using OpenAI GPT-4o Vision
// ============================================================================

import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

export const CONTENT_VIOLATION_MESSAGE =
  'Content violates platform safety guidelines. Please upload a professional beauty-service image.';

const MODERATION_PROMPT = `You are a content safety moderator for Elle.Be.O Growth Studio — a professional beauty and wellness platform used by licensed beauty technicians.

Analyse this image and determine if it is safe for a professional beauty business platform.

REJECT the image (safe: false) if it contains ANY of:
- Nudity or partial nudity (exposed breasts, genitalia, buttocks, intimate areas)
- Sexual, fetish, erotic, or NSFW content of any kind
- Suggestive or provocative poses — even if the person has visible hair, makeup or nails
- Lingerie, underwear, swimwear, or clothing that exposes intimate body areas
- Explicit body exposure beyond what is normal for a professional salon or clinic setting
- Pornographic content of any kind
- Minors in inappropriate contexts
- Hate symbols, violence, self-harm, illegal activities, or harassment imagery
- Offensive or inappropriate text overlays

CRITICAL RULE: The presence of hair, makeup, nails, or skincare does NOT automatically make an image safe.
A person with styled hair in a suggestive pose or revealing clothing must still be REJECTED.
The image must show the beauty SERVICE itself in a professional, clinical, or salon context.

ACCEPT the image (safe: true) only if it clearly shows ALL of these:
- A professional beauty service result (hair, makeup, skincare, nails, lashes, brows, spa, grooming)
- The subject is modestly dressed or the photo focuses on the service area only (e.g. close-up of hair, hands for nails, face for makeup)
- A professional service environment OR clearly a before/after documentation shot
- Nothing sexually suggestive about the pose, framing, or clothing

If the image is borderline, ambiguous, or the content cannot be clearly and confidently identified as professional beauty work — REJECT it.

Respond ONLY with valid JSON on a single line, no explanation, no markdown:
{"safe": true, "reason": "Professional beauty content"}
OR
{"safe": false, "reason": "Brief description of violation"}`;

type ModerationResult = { safe: boolean; reason: string };

@Injectable()
export class ContentModerationService {
  private client: OpenAI | null = null;

  private getClient(): OpenAI | null {
    if (!process.env['OPENAI_API_KEY']) {
      console.warn('[ContentModeration] OPENAI_API_KEY not set — image moderation skipped');
      return null;
    }
    if (!this.client) {
      this.client = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });
    }
    return this.client;
  }

  async moderateImage(imageUrl: string): Promise<ModerationResult> {
    const client = this.getClient();
    if (!client) return { safe: true, reason: 'Moderation skipped (no API key)' };

    try {
      const response = await client.chat.completions.create({
        model: 'gpt-4o',
        max_tokens: 256,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: MODERATION_PROMPT },
              { type: 'image_url', image_url: { url: imageUrl, detail: 'low' } },
            ],
          },
        ],
      });

      const text = response.choices[0]?.message?.content ?? '';
      console.log('[ContentModeration] Raw response:', text);

      // Extract JSON even if model adds surrounding text
      const jsonMatch = text.match(/\{[\s\S]*"safe"[\s\S]*\}/);
      if (!jsonMatch) {
        console.error('[ContentModeration] No JSON in response — rejecting');
        return { safe: false, reason: 'Could not verify image safety' };
      }

      const result = JSON.parse(jsonMatch[0]) as ModerationResult;
      console.log(`[ContentModeration] ${result.safe ? '✓ PASS' : '✗ REJECT'}: ${result.reason}`);
      return { safe: Boolean(result.safe), reason: String(result.reason ?? '') };
    } catch (err: any) {
      console.error('[ContentModeration] API error:', err.message);
      // Fail closed for pre-checks, fail open for post-upload checks
      return { safe: false, reason: 'Moderation service error — upload blocked' };
    }
  }

  assertImageSafe(result: ModerationResult): void {
    if (!result.safe) {
      throw new BadRequestException(CONTENT_VIOLATION_MESSAGE);
    }
  }
}
