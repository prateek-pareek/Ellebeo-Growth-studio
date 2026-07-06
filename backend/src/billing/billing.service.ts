import { Injectable, BadRequestException, InternalServerErrorException, Logger } from '@nestjs/common';
import Stripe from 'stripe';
import { PrismaService } from '../prisma/prisma.service';

type StripeClient = InstanceType<typeof Stripe>;
type StripeEvent = ReturnType<StripeClient['webhooks']['constructEvent']>;
type StripeCheckoutSession = Awaited<ReturnType<StripeClient['checkout']['sessions']['create']>>;

export type PlanTier = 'tier1' | 'tier2' | 'tier3' | 'tier4' | 'tier5';

const PLAN_NAMES: Record<PlanTier, string> = {
  tier1: 'Starter ($59/mo)',
  tier2: 'Growth ($99/mo)',
  tier3: 'Premium ($250/mo)',
  tier4: 'Premium+ ($500/mo)',
  tier5: 'Publicist ($2,000/mo)',
};

function getPriceId(plan: PlanTier): string {
  const key = `STRIPE_PRICE_${plan.toUpperCase()}` as const;
  const priceId = process.env[key];
  if (!priceId) throw new InternalServerErrorException(`${key} is not configured`);
  return priceId;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  private stripe: StripeClient | null = null;

  constructor(private prisma: PrismaService) {
    const secretKey = process.env.STRIPE_API_KEY ?? process.env.STRIPE_SECRET_KEY;
    if (secretKey) {
      this.stripe = new Stripe(secretKey);
    } else {
      this.logger.warn('STRIPE_API_KEY not set — billing disabled');
    }
  }

  async createCheckoutSession(tenantId: string, plan: PlanTier): Promise<{ url: string }> {
    if (!this.stripe) throw new InternalServerErrorException('Payments are not configured');

    const priceId = getPriceId(plan);
    const frontendUrl = process.env.FRONTEND_URL ?? 'http://localhost:5173';

    const session = await this.stripe.checkout.sessions.create({
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: tenantId,
      success_url: `${frontendUrl}/plans?success=true&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${frontendUrl}/plans?canceled=true`,
      metadata: { tenantId, tier: plan },
    });

    if (!session.url) throw new InternalServerErrorException('Stripe did not return a checkout URL');
    return { url: session.url };
  }

  async verifySession(tenantId: string, sessionId: string): Promise<{ applied: boolean; tier: string | null }> {
    if (!this.stripe) throw new InternalServerErrorException('Payments are not configured');

    const session = await this.stripe.checkout.sessions.retrieve(sessionId);

    if (session.client_reference_id !== tenantId) throw new BadRequestException('Session does not belong to this account');
    if (session.payment_status !== 'paid' && session.status !== 'complete') return { applied: false, tier: null };

    const tier = session.metadata?.tier as PlanTier | undefined;
    if (!tier) return { applied: false, tier: null };

    const existing = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { appliedStripeSessionIds: true },
    });
    if (existing?.appliedStripeSessionIds?.includes(sessionId)) {
      return { applied: true, tier };
    }

    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        subscriptionTier: tier as any,
        subscriptionStartedAt: new Date(),
        stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id,
        stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id,
        appliedStripeSessionIds: { push: sessionId },
      },
    });

    this.logger.log(`Tenant ${tenantId} subscribed to ${PLAN_NAMES[tier]} via session ${sessionId}`);
    return { applied: true, tier };
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
      const tier = session.metadata?.tier as PlanTier | undefined;

      if (tenantId && tier) {
        await this.prisma.tenant.update({
          where: { id: tenantId },
          data: {
            subscriptionTier: tier as any,
            subscriptionStartedAt: new Date(),
            stripeCustomerId: typeof session.customer === 'string' ? session.customer : (session.customer as any)?.id,
            stripeSubscriptionId: typeof session.subscription === 'string' ? session.subscription : (session.subscription as any)?.id,
          },
        });
        this.logger.log(`Webhook: tenant ${tenantId} activated ${PLAN_NAMES[tier]}`);
      }
    }

    if (event.type === 'customer.subscription.deleted') {
      const subscription = event.data.object as any;
      const customerId = typeof subscription.customer === 'string' ? subscription.customer : subscription.customer?.id;

      if (customerId) {
        await this.prisma.tenant.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            subscriptionTier: 'free' as any,
            stripeSubscriptionId: null,
            subscriptionExpiresAt: new Date(),
          },
        });
        this.logger.log(`Webhook: subscription cancelled for Stripe customer ${customerId} — downgraded to free`);
      }
    }
  }
}
