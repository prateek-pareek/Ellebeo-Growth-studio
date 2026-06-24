import { Controller, Post, Body, Req, Res, Headers, UseGuards, HttpCode } from '@nestjs/common';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard, TenantStatusGuard)
  @Post('checkout-session')
  createCheckoutSession(@Req() req: any) {
    return this.billingService.createCheckoutSession(req.user.tenantId);
  }

  @UseGuards(JwtAuthGuard, TenantStatusGuard)
  @Post('verify-session')
  verifySession(@Req() req: any, @Body('sessionId') sessionId: string) {
    return this.billingService.verifySession(req.user.tenantId, sessionId);
  }

  // Stripe calls this directly — no JWT available. Signature verification
  // (via STRIPE_WEBHOOK_SECRET) is what authenticates the request instead.
  // Requires the raw request body — see main.ts for the express.raw() middleware
  // scoped to this exact path.
  @Post('webhook')
  @HttpCode(200)
  async handleWebhook(@Req() req: any, @Res() res: Response, @Headers('stripe-signature') signature: string) {
    await this.billingService.handleWebhookEvent(req.body, signature);
    res.json({ received: true });
  }
}
