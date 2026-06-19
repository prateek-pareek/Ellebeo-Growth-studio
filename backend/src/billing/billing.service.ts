import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

// stripe v22's CJS default-export type only re-exports `.Stripe` as a plain
// type alias (not a dottable namespace), so `Stripe.Stripe.Event` etc. don't
// resolve. Deriving structurally from the real method signatures sidesteps
// the broken nested-namespace typing entirely.
type StripeClient = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripeCheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>;

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: StripeClient | null = null;

  constructor(private prisma: PrismaService) {
    // Same variable name convention as elleobe-backend's Stripe integration.
    const secretKey = process.env.STRIPE_API_KEY ?? process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.warn('STRIPE_API_KEY not set — billing disabled');
    }
  }

  // Single one-time-purchase plan. Price is built inline via `price_data`
  // (instead of a pre-created Stripe Price object) so it always matches
  // whatever the admin currently has set in PlanSettings — no risk of the
  // Stripe Dashboard and the admin panel drifting out of sync.
  async createCheckoutSession(tenantId: string): Promise<{ url: string }> {
    if (!this.stripe) throw new InternalServerErrorException('Payments are not configured');

    const settings = await this.prisma.planSettings.upsert({
      where: { id: 'default' },
      update: {},
      create: { id: 'default' },
    });

    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: { name: `Elle.Be.O Growth Studio — ${settings.generationsIncluded} generations` },
          unit_amount: Math.round(settings.priceUsd * 100),
        },
        quantity: 1,
      }],
      client_reference_id: tenantId,
      success_url: `${frontendUrl}/plans?success=true`,
      cancel_url: `${frontendUrl}/plans?canceled=true`,
      metadata: { tenantId, generationsIncluded: String(settings.generationsIncluded) },
    });

    if (!session.url) throw new InternalServerErrorException('Stripe did not return a checkout URL');
    return { url: session.url };
  }

  async handleWebhookEvent(rawBody: Buffer, signature: string): Promise<void> {
    if (!this.stripe) throw new InternalServerErrorException('Payments are not configured');

    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) throw new InternalServerErrorException('Stripe webhook secret is not configured');

    let event: StripeEvent;
    try {
      event = this.stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
    } catch (err: any) {
      throw new BadRequestException(`Webhook signature verification failed: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as StripeCheckoutSession;
      const tenantId = session.client_reference_id;
      const generationsIncluded = Number(session.metadata?.generationsIncluded ?? 0);

      if (tenantId && generationsIncluded > 0) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            // Additive — buying again tops up rather than resets, in case
            // they purchase before fully using a previous batch.
            planGenerationsTotal: { increment: generationsIncluded },
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
          },
        });
        this.logger.log(`Tenant ${tenantId} purchased ${generationsIncluded} generations for $${(session.amount_total ?? 0) / 100}`);
      }
    }
  }
}
