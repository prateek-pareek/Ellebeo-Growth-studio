import { Injectable, ForbiddenException } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

export interface TierRules {
  tier: 'basic' | 'enhanced' | 'premium';
  maxBookingsPerDay: number;
  allowsNonBookingContent: boolean;
  allowsFullBrandDNA: boolean;
  allowsEnhancedVisuals: boolean;
}

@Injectable()
export class TierGatingService {
  constructor(private readonly prisma: PrismaClient) {}

  getTierRules(tier: string): TierRules {
    const normalized = (tier || 'free').toLowerCase();

    // Premium: tier3, tier4, tier5, premium — full access, unlimited
    if (['premium', 'tier3', 'tier4', 'tier5'].includes(normalized)) {
      return {
        tier: 'premium',
        maxBookingsPerDay: 999,
        allowsNonBookingContent: true,
        allowsFullBrandDNA: true,
        allowsEnhancedVisuals: true,
      };
    }

    // Enhanced: tier2, standard — unlimited booking posts, no brand/marketing
    if (['enhanced', 'standard', 'tier2'].includes(normalized)) {
      return {
        tier: 'enhanced',
        maxBookingsPerDay: 999,
        allowsNonBookingContent: false,
        allowsFullBrandDNA: true,
        allowsEnhancedVisuals: true,
      };
    }

    // Basic: free, tier1 — 2/day, booking only
    return {
      tier: 'basic',
      maxBookingsPerDay: 2,
      allowsNonBookingContent: false,
      allowsFullBrandDNA: false,
      allowsEnhancedVisuals: false,
    };
  }

  async validateRequest(tenantId: string, subscriptionTier: string, isNonBooking: boolean): Promise<void> {
    if (process.env.TRIAL_LIMIT_BYPASS?.trim() === 'true') {
      return;
    }
    const rules = this.getTierRules(subscriptionTier);

    // Rule 1: Limit non-booking content
    if (isNonBooking && !rules.allowsNonBookingContent) {
      throw new ForbiddenException(`Your subscription tier (${rules.tier}) does not support general marketing or non-booking content. Upgrade to Premium to unlock always-on marketing posts.`);
    }

    // Rule 2: Limit daily booking counts for Basic Tier
    if (rules.tier === 'basic') {
      const startOfDay = new Date();
      startOfDay.setUTCHours(0, 0, 0, 0);

      const count = await this.prisma.generationJob.count({
        where: {
          tenantId,
          createdAt: { gte: startOfDay },
          state: { notIn: ['failed', 'blocked'] },
        },
      });

      if (count >= rules.maxBookingsPerDay) {
        throw new ForbiddenException(`Daily generation limit reached. Tier 1 (Basic) is restricted to a maximum of ${rules.maxBookingsPerDay} posts per day.`);
      }
    }
  }
}
