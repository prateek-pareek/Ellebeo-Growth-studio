// ============================================================================
// content-moderation.service.ts — Image safety using OpenAI GPT-4o Vision
// ============================================================================

import { Injectable, BadRequestException } from '@nestjs/common';
import OpenAI from 'openai';

export const CONTENT_VIOLATION_MESSAGE =
  'Content violates platform safety guidelines. Please upload a professional beauty-service image.';

const MODERATION_PROMPT = `You are a content safety moderator for Elle.Be.O Growth Studio — a professional beauty and wellness platform used by licensed beauty technicians.

Analyse this image and determine if it is safe for a professional beauty business platform.

REJECT the image (safe: false) ONLY if it clearly contains:
- Full or partial nudity (exposed breasts, genitalia, buttocks, intimate areas)
- Pornographic or sexually explicit content
- Lingerie or underwear as the primary subject
- Hate symbols, graphic violence, self-harm, or illegal activity imagery
- Offensive or harassing text overlays

ACCEPT the image (safe: true) if it shows any of:
- Hair styling, colouring, cutting, or treatment results
- Makeup, skincare, lashes, brows, nails, or any beauty service
- A person's face, hair, hands, or upper body in a neutral or professional context
- Before/after shots of beauty services
- Normal everyday clothing such as tank tops, off-shoulder tops, salon capes, or similar — these are completely fine

IMPORTANT: Beauty photos commonly show clients wearing tank tops, sleeveless tops, or off-shoulder clothing so the hair or shoulders are visible. This is normal and must be ACCEPTED. Only reject for actual nudity or explicit sexual content.

When in doubt, ACCEPT. Only reject images that clearly and obviously violate the rules above.

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
      // Fail open — don't block legitimate uploads due to moderation service errors
      return { safe: true, reason: 'Moderation service error — defaulting to safe' };
    }
  }

  assertImageSafe(result: ModerationResult): void {
    if (!result.safe) {
      throw new BadRequestException(CONTENT_VIOLATION_MESSAGE);
    }
  }
}
