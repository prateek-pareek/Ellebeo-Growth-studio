import { Controller, Post, Body, Req, Res, Headers, UseGuards, HttpCode, BadRequestException } from '@nestjs/common';
import { Response } from 'express';
import { BillingService } from './billing.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @UseGuards(JwtAuthGuard, TenantStatusGuard)
  @Post('checkout-session')
  createCheckoutSession(@Req() req: any, @Body('plan') plan: string) {
    const validPlans = ['tier1', 'tier2', 'tier3', 'tier4', 'tier5'];
    if (!validPlans.includes(plan)) {
      throw new BadRequestException(`plan must be one of: ${validPlans.join(', ')}`);
    }
    return this.billingService.createCheckoutSession(req.user.tenantId, plan as any);
  }
  
  @Post('verify-session')
  verifySession(@Body('sessionId') sessionId: string) {
    return this.billingService.verifySessionPublic(sessionId);
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
