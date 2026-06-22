import { Controller, Get, Query, Res } from '@nestjs/common';
import { Response } from 'express';
import { ScheduleService } from './schedule.service';

/**
 * Handles OAuth callbacks from external platforms (Instagram/Facebook).
 * These are browser redirects — no JWT is available, so no auth guards.
 * tenantId is decoded from the `state` parameter set when building the OAuth URL.
 */
@Controller()
export class SocialOAuthController {
  constructor(private readonly scheduleService: ScheduleService) {}

  @Get('social-accounts/connect/instagram/callback')
  async instagramCallback(
    @Query('code')  code:  string,
    @Query('state') state: string,
    @Query('error') error: string,
    @Res() res: Response,
  ) {
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

    if (error || !code) {
      return res.redirect(`${frontendUrl}/profile?error=instagram_denied`);
    }

    try {
      await this.scheduleService.handleInstagramCallback(code, state);
      return res.redirect(`${frontendUrl}/profile?connected=instagram`);
    } catch {
      return res.redirect(`${frontendUrl}/profile?error=instagram_connect_failed`);
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

    if (error || !code) {
      return res.redirect(`${frontendUrl}/profile?error=facebook_denied`);
    }

    try {
      await this.scheduleService.handleFacebookCallback(code, state);
      return res.redirect(`${frontendUrl}/profile?connected=facebook`);
    } catch {
      return res.redirect(`${frontendUrl}/profile?error=facebook_connect_failed`);
    }
  }
}
