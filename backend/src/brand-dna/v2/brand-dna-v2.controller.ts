import { Controller, Post, Body, UseGuards, ServiceUnavailableException } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../../common/guards/tenant-status.guard';
import { getRedisClient } from '../../config/redis.client';
import { BrandDnaSuggestionChain } from './brand-dna-suggestion.chain';
import { BrandDnaSuggestionCache } from './brand-dna-suggestion.cache';
import {
  SuggestIdentityDto, SuggestEssenceDto, SuggestAudienceDto, SuggestStrategyDto, DraftStoryDto,
} from './dto/brand-dna-suggest.dto';

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
