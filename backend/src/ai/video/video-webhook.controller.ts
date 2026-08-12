// ============================================================================
// video-webhook.controller.ts — receives Shotstack's render-complete callback.
// Auth is a shared-secret token embedded in the callback url (set when the
// render was submitted, see VideoRenderService.submitRenderForPlan) — Shotstack
// does not support HMAC request signing, so this mirrors the Stripe webhook's
// intent (authenticate the caller) with the mechanism this provider supports.
// ============================================================================

import { Body, Controller, HttpCode, Param, Post, Query, UnauthorizedException } from '@nestjs/common';
import { VideoRenderService, ShotstackCallbackPayload } from './video-render.service';

@Controller('video/webhooks')
export class VideoWebhookController {
  constructor(private readonly videoRenderService: VideoRenderService) {}

  @Post('shotstack/:videoPlanId')
  @HttpCode(200)
  async handleShotstackCallback(
    @Param('videoPlanId') videoPlanId: string,
    @Query('token') token: string,
    @Body() body: any,
  ) {
    if (!token || token !== process.env['VIDEO_WEBHOOK_SECRET']) {
      throw new UnauthorizedException('Invalid webhook token');
    }

    // Shotstack's status payload is nested under `response` on the polling
    // endpoint; callback payloads have been observed both wrapped and flat,
    // so accept either shape.
    const payload: ShotstackCallbackPayload = body?.response ?? body;
    await this.videoRenderService.handleRenderCallback(videoPlanId, payload);
    return { received: true };
  }
}
