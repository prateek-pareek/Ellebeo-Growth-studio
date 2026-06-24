import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ScheduleService } from './schedule.service';

/**
 * Handles OAuth callbacks from external platforms (Instagram/Facebook).
 * These are browser redirects — no JWT is available, so no auth guards.
 * tenantId is decoded from the `state` parameter set when building the OAuth URL.
 *
 * When the OAuth flow is initiated from the mobile app, a `mobileRedirectUri`
 * is embedded in the `state` payload. After a successful callback we redirect
 * to that URI (e.g. elleobe://growth-studio/instagram-connected) so the OS
 * hands control back to the native app instead of opening the web frontend.
 */
@Controller()
export class SocialOAuthController {
  constructor(private readonly scheduleService: ScheduleService) {}

  /** Decode `mobileRedirectUri` from the base64url-encoded state, if present. */
  private getMobileRedirectUri(state: string, platform: string): string | null {
    try {
      const decoded = JSON.parse(Buffer.from(state, 'base64url').toString());
      return decoded?.mobileRedirectUri ?? null;
    } catch {
      return null;
    }
  }

  @Get('social-accounts/connect/instagram/callback')
  async instagramCallback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const mobileUri = this.getMobileRedirectUri(state, 'instagram');

    if (error || !code) {
      // Redirect back to mobile app (or web) with error signal
      const errorUri = mobileUri
        ? `${mobileUri}?error=instagram_denied`
        : `${frontendUrl}/profile?error=instagram_denied`;
      return res.redirect(errorUri);
    }

    try {
      await this.scheduleService.handleInstagramCallback(code, state);
      // If the flow started from the mobile app, redirect to the deep link
      const successUri = mobileUri
        ? `${mobileUri}?connected=instagram`
        : `${frontendUrl}/profile?connected=instagram`;
      return res.redirect(successUri);
    } catch {
      const errorUri = mobileUri
        ? `${mobileUri}?error=instagram_connect_failed`
        : `${frontendUrl}/profile?error=instagram_connect_failed`;
      return res.redirect(errorUri);
    }
  }

  @Get('social-accounts/connect/facebook/callback')
  async facebookCallback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';
    const mobileUri = this.getMobileRedirectUri(state, 'facebook');

    if (error || !code) {
      const errorUri = mobileUri
        ? `${mobileUri}?error=facebook_denied`
        : `${frontendUrl}/profile?error=facebook_denied`;
      return res.redirect(errorUri);
    }

    try {
      await this.scheduleService.handleFacebookCallback(code, state);
      const successUri = mobileUri
        ? `${mobileUri}?connected=facebook`
        : `${frontendUrl}/profile?connected=facebook`;
      return res.redirect(successUri);
    } catch {
      const errorUri = mobileUri
        ? `${mobileUri}?error=facebook_connect_failed`
        : `${frontendUrl}/profile?error=facebook_connect_failed`;
      return res.redirect(errorUri);
    }
  }
}
