import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import {
  coerceGuidedDraft,
  emptyGuidedDraft,
  isGuidedDnaEnabled,
  validateGuidedProfile,
  type GuidedDnaProfile,
} from './guided-dna/contract';
import { seedGuidedFromLegacy } from './guided-dna/seed-from-legacy';
import {
  draftStory,
  suggestAudience,
  suggestEssence,
  suggestIdentity,
  suggestStrategy,
} from './guided-dna/suggest';

type CacheEntry = { at: number; value: unknown };
const CACHE_TTL_MS = 10 * 60 * 1000;

@Injectable()
export class GeminiLabDnaService {
  private readonly logger = new Logger(GeminiLabDnaService.name);
  private readonly cache = new Map<string, CacheEntry>();

  constructor(private readonly prisma: PrismaService) {}

  assertEnabled() {
    if (!isGuidedDnaEnabled()) {
      throw new BadRequestException('Guided Brand DNA is off for this environment.');
    }
  }

  async getState(tenantId: string) {
    this.assertEnabled();
    const [row, dna, tenant] = await Promise.all([
      this.prisma.geminiLabBrandDna.findUnique({ where: { tenantId } }),
      this.prisma.brandDNA.findUnique({
        where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
      }),
      this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessName: true } }),
    ]);

    const seeded = seedGuidedFromLegacy({ dna, tenantName: tenant?.businessName });
    let draft = row ? coerceGuidedDraft(row.draft) : seeded;
    draft = lockIdentityFromProduction(draft, dna, tenant?.businessName);
    const profile = row?.profile ? lockIdentityFromProduction(coerceGuidedDraft(row.profile), dna, tenant?.businessName) : null;

    if (!row) {
      await this.prisma.geminiLabBrandDna.create({
        data: { tenantId, currentStep: 1, draft: draft as any },
      });
    }

    return {
      currentStep: row?.currentStep ?? 1,
      draft,
      profile: profile && row?.completedAt ? profile : null,
      completedAt: row?.completedAt?.toISOString() ?? null,
      seededFromLegacy: !row,
      hasProductionDna: !!dna,
    };
  }

  async saveDraft(tenantId: string, currentStep: number, raw: unknown) {
    this.assertEnabled();
    const dna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessName: true } });
    const draft = lockIdentityFromProduction(coerceGuidedDraft(raw), dna, tenant?.businessName);
    const row = await this.prisma.geminiLabBrandDna.upsert({
      where: { tenantId },
      create: { tenantId, currentStep, draft: draft as any },
      update: { currentStep, draft: draft as any },
    });
    return { currentStep: row.currentStep, draft, completedAt: row.completedAt?.toISOString() ?? null };
  }

  async complete(tenantId: string, raw: unknown) {
    this.assertEnabled();
    const dna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    });
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { businessName: true } });
    const draft = lockIdentityFromProduction(coerceGuidedDraft(raw), dna, tenant?.businessName);
    const errors = validateGuidedProfile(draft);
    if (errors.length) throw new BadRequestException(errors.join(' '));
    if (!draft.story.userWritten && !draft.story.aiDrafted) {
      const story = await draftStory(draft);
      draft.story.aiDrafted = story.aiDrafted;
    }
    draft.meta.completedAt = new Date().toISOString();
    const row = await this.prisma.geminiLabBrandDna.upsert({
      where: { tenantId },
      create: {
        tenantId,
        currentStep: 7,
        draft: draft as any,
        profile: draft as any,
        completedAt: new Date(),
      },
      update: {
        currentStep: 7,
        draft: draft as any,
        profile: draft as any,
        completedAt: new Date(),
      },
    });
    this.logger.log(`Guided DNA completed tenant=${tenantId}`);
    return { profile: draft, completedAt: row.completedAt?.toISOString() ?? null };
  }

  async getCompletedProfile(tenantId: string): Promise<GuidedDnaProfile | null> {
    if (!isGuidedDnaEnabled()) return null;
    const row = await this.prisma.geminiLabBrandDna.findUnique({ where: { tenantId } });
    if (!row?.profile || !row.completedAt) return null;
    return coerceGuidedDraft(row.profile);
  }

  async suggestIdentity(tenantId: string, dto: { serviceCategory?: string; services?: string[]; logoUrl?: string }) {
    this.assertEnabled();
    return this.cached(`id:${tenantId}:${dto.serviceCategory}:${(dto.services || []).join(',')}`, () =>
      suggestIdentity(dto),
    );
  }

  async suggestEssence(tenantId: string, dto: { mood: string; services?: string[] }) {
    this.assertEnabled();
    return this.cached(`es:${tenantId}:${dto.mood}:${(dto.services || []).join(',')}`, () => suggestEssence(dto));
  }

  async suggestAudience(tenantId: string, dto: { serviceCategory?: string; services?: string[] }) {
    this.assertEnabled();
    return this.cached(`au:${tenantId}:${dto.serviceCategory}:${(dto.services || []).join(',')}`, () =>
      suggestAudience(dto),
    );
  }

  async suggestStrategy(tenantId: string, dto: { objective?: string; services?: string[] }) {
    this.assertEnabled();
    return this.cached(`st:${tenantId}:${dto.objective}:${(dto.services || []).join(',')}`, () =>
      suggestStrategy(dto),
    );
  }

  async draftStory(tenantId: string, raw: unknown) {
    this.assertEnabled();
    const draft = coerceGuidedDraft(raw);
    const key = createHash('sha1').update(JSON.stringify({
      n: draft.identity.brandName,
      m: draft.identity.mood,
      e: draft.identity.essence,
      s: draft.offering.services,
      o: draft.strategy.objective,
      w: draft.story.userWritten,
    })).digest('hex');
    return this.cached(`story:${tenantId}:${key}`, () => draftStory(draft));
  }

  empty() {
    return emptyGuidedDraft();
  }

  private async cached<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value as T;
    const value = await fn();
    this.cache.set(key, { at: Date.now(), value });
    return value;
  }
}

/** Name, logo and palette always come from production Brand DNA — never re-typed in Lab. */
function lockIdentityFromProduction(
  draft: GuidedDnaProfile,
  dna: any,
  tenantName?: string | null,
): GuidedDnaProfile {
  if (!dna && !tenantName) return draft;
  const v2 = typeof dna?.brandDnaV2 === 'string'
    ? (() => { try { return JSON.parse(dna.brandDnaV2); } catch { return null; } })()
    : dna?.brandDnaV2;
  const pal = v2?.visual_identity?.palette || {};
  const name = String(v2?.foundations?.professional_name || dna?.businessName || tenantName || draft.identity.brandName || '').trim();
  const logo = dna?.logoUrl || v2?.logo_asset_url || v2?.logo_storage_path || draft.identity.logoUrl;
  const fromDna = pal.background || dna?.backgroundBrandColor
    ? [
        pal.background || dna?.backgroundBrandColor,
        pal.secondary || dna?.secondaryBrandColor,
        pal.depth || dna?.depthBrandColor || pal.primary || dna?.primaryBrandColor,
        pal.accent || dna?.accentBrandColor,
      ] as GuidedDnaProfile['identity']['palette']
    : draft.identity.palette;
  return {
    ...draft,
    identity: {
      ...draft.identity,
      brandName: name || draft.identity.brandName,
      logoUrl: logo || null,
      palette: fromDna,
    },
  };
}
