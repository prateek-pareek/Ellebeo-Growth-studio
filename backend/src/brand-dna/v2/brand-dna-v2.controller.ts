import { Controller, Get, Put, Post, Body, Req, UseGuards, ServiceUnavailableException, BadRequestException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../../common/guards/tenant-status.guard';
import { getRedisClient } from '../../config/redis.client';
import { PrismaService } from '../../prisma/prisma.service';
import { BrandDnaSuggestionChain } from './brand-dna-suggestion.chain';
import { BrandDnaSuggestionCache } from './brand-dna-suggestion.cache';
import { mapProfileToContract, mapContractToProfileData } from './brand-dna-v2.mapper';
import { BrandDnaV2Contract } from './brand-dna-v2.types';
import {
  SuggestIdentityDto, SuggestEssenceDto, SuggestAudienceDto, SuggestStrategyDto, DraftStoryDto,
} from './dto/brand-dna-suggest.dto';
import { TrackBrandDnaEventDto } from './dto/brand-dna-event.dto';

function assertGuidedV2Enabled(): void {
  if (process.env.BRAND_DNA_GUIDED_V2?.trim() !== 'true') {
    throw new ServiceUnavailableException('Brand DNA Guided v2 is not enabled');
  }
}

// Phase 3 — /brand_dna_implementation_plan.md §5. Feature-flagged
// (BRAND_DNA_GUIDED_V2), throttled per-route, and cached by hashed input.
// Every response is validated/repaired against the controlled vocab inside
// BrandDnaSuggestionChain before it ever reaches this controller.
@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('brand-dna')
export class BrandDnaV2Controller {
  private readonly chain = new BrandDnaSuggestionChain();
  private readonly cache = new BrandDnaSuggestionCache(getRedisClient());

  constructor(private readonly prisma: PrismaService) {}

  // Phase 6: getProfile/saveProfile are NOT flag-gated — /brand/onboarding
  // now unconditionally renders the guided flow for every technician (the
  // route swap already shipped), so these two are load-bearing, not an
  // opt-in experiment. Only the AI suggestion endpoints below stay gated;
  // the frontend already degrades gracefully if those are off.
  @Get('v2')
  async getProfile(@Req() req: any) {
    const profile = await this.prisma.brandDnaProfile.findUnique({
      where: { unique_current_brand_dna_profile: { tenantId: req.user.tenantId, isCurrent: true } },
    });
    return profile ? mapProfileToContract(profile) : null;
  }

  @Put('v2')
  async saveProfile(@Req() req: any, @Body() contract: BrandDnaV2Contract) {
    if (!contract?.identity?.brandName || !contract?.identity?.mood) {
      throw new BadRequestException('identity.brandName and identity.mood are required');
    }
    if (contract.identity.mood === 'CUSTOM' && !contract.identity.customMoodLabel) {
      throw new BadRequestException('identity.customMoodLabel is required when mood is CUSTOM');
    }

    const tenantId = req.user.tenantId;
    const data = mapContractToProfileData(contract, tenantId);

    try {
      const existing = await this.prisma.brandDnaProfile.findUnique({
        where: { unique_current_brand_dna_profile: { tenantId, isCurrent: true } },
      });
      const saved = existing
        ? await this.prisma.brandDnaProfile.update({ where: { id: existing.id }, data })
        : await this.prisma.brandDnaProfile.create({ data });
      return mapProfileToContract(saved);
    } catch (err: any) {
      if (err?.code === 'P2000' || err?.name === 'PrismaClientValidationError') {
        throw new BadRequestException('Invalid Brand DNA payload: ' + err.message);
      }
      throw err;
    }
  }

  // Phase 6 analytics — never flag-gated, never throttled tightly enough to
  // drop real events, and failures here must never surface to the caller
  // (the frontend fires these fire-and-forget; a 4xx would just be noise).
  @Post('v2/events')
  async trackEvent(@Req() req: any, @Body() dto: TrackBrandDnaEventDto) {
    try {
      await this.prisma.brandDnaOnboardingEvent.create({
        data: { tenantId: req.user.tenantId, event: dto.event, step: dto.step, metadata: dto.metadata as any },
      });
    } catch {
      // Swallow — analytics must never break the onboarding flow it's measuring.
    }
    return { ok: true };
  }

  @Get('v2/events/summary')
  async eventsSummary(@Req() req: any) {
    const grouped = await this.prisma.brandDnaOnboardingEvent.groupBy({
      by: ['event', 'step'],
      where: { tenantId: req.user.tenantId },
      _count: { _all: true },
    });
    return grouped.map((g) => ({ event: g.event, step: g.step, count: g._count._all }));
  }

  @Post('suggest/identity')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async suggestIdentity(@Body() dto: SuggestIdentityDto) {
    assertGuidedV2Enabled();
    const cached = await this.cache.get('identity', dto);
    if (cached) return cached;
    const result = await this.chain.suggestIdentity(dto);
    await this.cache.set('identity', dto, result);
    return result;
  }

  @Post('suggest/essence')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async suggestEssence(@Body() dto: SuggestEssenceDto) {
    assertGuidedV2Enabled();
    const cached = await this.cache.get('essence', dto);
    if (cached) return cached;
    const result = await this.chain.suggestEssence(dto);
    await this.cache.set('essence', dto, result);
    return result;
  }

  @Post('suggest/audience')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async suggestAudience(@Body() dto: SuggestAudienceDto) {
    assertGuidedV2Enabled();
    const cached = await this.cache.get('audience', dto);
    if (cached) return cached;
    const result = await this.chain.suggestAudience(dto);
    await this.cache.set('audience', dto, result);
    return result;
  }

  @Post('suggest/strategy')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async suggestStrategy(@Body() dto: SuggestStrategyDto) {
    assertGuidedV2Enabled();
    const cached = await this.cache.get('strategy', dto);
    if (cached) return cached;
    const result = await this.chain.suggestStrategy(dto);
    await this.cache.set('strategy', dto, result);
    return result;
  }

  @Post('draft-story')
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async draftStory(@Body() dto: DraftStoryDto) {
    assertGuidedV2Enabled();
    const cached = await this.cache.get('draft-story', dto);
    if (cached) return cached;
    const result = await this.chain.draftStory(dto);
    await this.cache.set('draft-story', dto, result);
    return result;
  }
}
