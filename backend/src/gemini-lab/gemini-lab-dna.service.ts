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
  adjustBrand,
} from './guided-dna/suggest';
import { scanWebsiteForBrandDna, type WebsiteScanResult } from './guided-dna/website-scan';
import { appendLook, parseRecentLooks, type LookSignature } from './guided-dna/creative-memory';
import { builtinLibrary, toStored, toTemplate, validateStored, type StoredTemplate } from './template-store';
import { extractLayout, extractedKey } from './layout-extract';
import { TEMPLATES, type PostTemplate } from './templates';
import {
  PROMPT_BLOCKS,
  PROMPT_BLOCK_IDS,
  buildImprovePrompt,
  coercePromptOverrides,
  parseImprovedBlock,
  resolveBlock,
  type PromptBlockId,
  type PromptOverrides,
} from './prompt-registry';

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

    // seedGuidedFromLegacy is a ONE-TIME bootstrap from the legacy production
    // record when a tenant has no guided row yet — convenient starting point,
    // not an ongoing lock. Once a guided row exists, it's the sole source of
    // truth: name/logo/palette/etc. are genuinely Gemini-Lab-owned and never
    // silently overwritten by the legacy record on every read.
    const seeded = seedGuidedFromLegacy({ dna, tenantName: tenant?.businessName });
    const draft = row ? coerceGuidedDraft(row.draft) : seeded;
    const profile = row?.profile ? coerceGuidedDraft(row.profile) : null;

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
    const draft = coerceGuidedDraft(raw);
    const row = await this.prisma.geminiLabBrandDna.upsert({
      where: { tenantId },
      create: { tenantId, currentStep, draft: draft as any },
      update: { currentStep, draft: draft as any },
    });
    return { currentStep: row.currentStep, draft, completedAt: row.completedAt?.toISOString() ?? null };
  }

  async complete(tenantId: string, raw: unknown) {
    this.assertEnabled();
    const draft = coerceGuidedDraft(raw);
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
        currentStep: 5,
        draft: draft as any,
        profile: draft as any,
        completedAt: new Date(),
      },
      update: {
        currentStep: 5,
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

  /** Recent look signatures for this brand — drives the generation avoid-list. */
  async getRecentLooks(tenantId: string): Promise<LookSignature[]> {
    try {
      const row = await this.prisma.geminiLabBrandDna.findUnique({
        where: { tenantId },
        select: { recentLooks: true },
      });
      return parseRecentLooks(row?.recentLooks);
    } catch (err) {
      // Memory is an enhancement, never a blocker — a read failure must not
      // take down generation.
      this.logger.warn(`Could not read creative memory: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Records the option the technician actually picked.
   *
   * Appended as a `chosen` look, which is what the plan builder leans toward.
   * Served looks continue to be recorded at generation time for the avoid-list;
   * the two are deliberately different signals.
   */
  async recordSelection(tenantId: string, look: LookSignature): Promise<void> {
    await this.recordLook(tenantId, { ...look, chosen: true });
  }

  async recordLook(tenantId: string, look: LookSignature): Promise<void> {
    try {
      const existing = await this.getRecentLooks(tenantId);
      const next = appendLook(existing, look);
      await this.prisma.geminiLabBrandDna.updateMany({
        where: { tenantId },
        data: { recentLooks: next as any },
      });
    } catch (err) {
      this.logger.warn(`Could not record creative memory: ${(err as Error).message}`);
    }
  }

  /** This tenant's prompt overrides. Empty means the shipped defaults are in force. */
  async getPromptOverrides(tenantId: string): Promise<PromptOverrides> {
    try {
      const row = await this.prisma.geminiLabBrandDna.findUnique({
        where: { tenantId },
        select: { promptOverrides: true },
      });
      return coercePromptOverrides(row?.promptOverrides);
    } catch (err) {
      // An override is an enhancement; failing to read one must never stop a
      // generation, it just means the defaults apply.
      this.logger.warn(`Could not read prompt overrides: ${(err as Error).message}`);
      return {};
    }
  }

  /** Editor state: every block with its default, its override, and what is actually in force. */
  async getPromptBlocks(tenantId: string) {
    const overrides = await this.getPromptOverrides(tenantId);
    return {
      blocks: PROMPT_BLOCK_IDS.map((id) => ({
        id,
        label: PROMPT_BLOCKS[id].label,
        help: PROMPT_BLOCKS[id].help,
        maxChars: PROMPT_BLOCKS[id].maxChars,
        default: PROMPT_BLOCKS[id].default,
        override: overrides[id] ?? null,
        effective: resolveBlock(id, overrides),
      })),
    };
  }

  async savePromptBlocks(tenantId: string, raw: unknown) {
    const overrides = coercePromptOverrides(raw);
    await this.prisma.geminiLabBrandDna.upsert({
      where: { tenantId },
      create: { tenantId, currentStep: 1, draft: emptyGuidedDraft() as any, promptOverrides: overrides as any },
      update: { promptOverrides: overrides as any },
    });
    this.logger.log(`Prompt blocks saved tenant=${tenantId} overridden=[${Object.keys(overrides).join(',')}]`);
    return this.getPromptBlocks(tenantId);
  }

  /**
   * Rewrites one block from a plain-language wish.
   *
   * Returns a SUGGESTION — it is not saved. The technician sees the rewrite
   * next to the current text and decides, so an AI edit can never silently
   * change how their posts sound.
   */
  async improvePromptBlock(tenantId: string, id: PromptBlockId, wish: string): Promise<{ suggestion: string }> {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new BadRequestException('Prompt improvement is not configured on this server.');
    const block = PROMPT_BLOCKS[id];
    if (!block) throw new BadRequestException(`Unknown prompt block "${id}".`);
    if (!wish?.trim()) throw new BadRequestException('Say what you want changed.');

    const overrides = await this.getPromptOverrides(tenantId);
    const prompt = buildImprovePrompt({ block, current: resolveBlock(id, overrides), wish: wish.trim() });
    const model = process.env['GEMINI_MODEL'] || 'gemini-2.5-flash';
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
        }),
      },
    );
    const json = (await res.json()) as any;
    if (!res.ok) throw new BadRequestException(json?.error?.message || 'Could not rewrite that section just now.');
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    const suggestion = parseImprovedBlock(text, block);
    if (!suggestion) throw new BadRequestException('The rewrite came back unusable. Try describing the change differently.');
    return { suggestion };
  }

  /**
   * The layouts available to a salon: the shared library plus its own.
   *
   * Falls back to the built-in library when the table is empty or unreachable
   * — a database that has not been seeded yet must not leave the generator
   * with nothing to compose with.
   */
  async getTemplates(tenantId: string): Promise<PostTemplate[]> {
    try {
      const rows = await this.prisma.geminiLabTemplate.findMany({
        where: { isActive: true, OR: [{ tenantId: null }, { tenantId }] },
        orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }],
      });
      if (!rows.length) return TEMPLATES;
      // A salon's own layout of the same key overrides the shared one.
      const byKey = new Map<string, PostTemplate>();
      for (const row of rows) {
        const template = toTemplate(row as unknown as StoredTemplate);
        if (!template) {
          this.logger.warn(`Skipping malformed template "${row.key}"`);
          continue;
        }
        if (row.tenantId || !byKey.has(row.key)) byKey.set(row.key, template);
      }
      return byKey.size ? [...byKey.values()] : TEMPLATES;
    } catch (err) {
      this.logger.warn(`Could not read templates, using the built-in library: ${(err as Error).message}`);
      return TEMPLATES;
    }
  }

  /** Writes the shared library. Idempotent, so it is safe to run on every deploy. */
  async seedTemplateLibrary(): Promise<{ seeded: number }> {
    const rows = builtinLibrary();
    for (const row of rows) {
      // findFirst + create/update rather than upsert: Prisma refuses a null
      // inside a compound unique lookup, and the shared library is exactly the
      // rows whose tenant is null. A partial unique index keeps them unique.
      const existing = await this.prisma.geminiLabTemplate.findFirst({
        where: { tenantId: null, key: row.key },
        select: { id: true },
      });
      const data = {
        name: row.name,
        intent: row.intent,
        photoMode: row.photoMode,
        regions: row.regions as any,
        defaults: row.defaults as any,
        allows: row.allows as any,
        suits: row.suits,
        sortOrder: row.sortOrder,
      };
      if (existing) {
        await this.prisma.geminiLabTemplate.update({ where: { id: existing.id }, data });
      } else {
        await this.prisma.geminiLabTemplate.create({ data: { ...data, key: row.key, source: 'builtin' } });
      }
    }
    this.logger.log(`Seeded ${rows.length} shared layouts`);
    return { seeded: rows.length };
  }

  /**
   * Saves a salon's own layout — refusing it if it would render a broken post.
   *
   * This is the import gate. A template that fails here never reaches a
   * technician; the alternative is discovering the fault one bad post at a
   * time, which is what the hard-coded library was protecting against by
   * simply not letting anyone add layouts.
   */
  async saveTemplate(tenantId: string, raw: StoredTemplate) {
    const { template, errors } = validateStored(raw);
    if (!template || errors.length) {
      throw new BadRequestException(
        `That layout would not render correctly: ${errors.join('; ') || 'it is malformed.'}`,
      );
    }
    const row = toStored(template);
    const saved = await this.prisma.geminiLabTemplate.upsert({
      where: { tenantId_key: { tenantId, key: row.key } },
      create: { ...row, allows: row.allows as any, source: 'custom', tenantId },
      update: {
        name: row.name,
        intent: row.intent,
        photoMode: row.photoMode,
        regions: row.regions as any,
        defaults: row.defaults as any,
        allows: row.allows as any,
        suits: row.suits,
        source: 'custom',
        version: { increment: 1 },
      },
    });
    this.logger.log(`Template saved tenant=${tenantId} key=${row.key} v${saved.version}`);
    return { key: saved.key, version: saved.version };
  }

  /**
   * Turns a reference image into a layout this salon can be composed in.
   *
   * The style-reference upload previously influenced copy and art texture but
   * never the arrangement — the one thing a technician is actually pointing at
   * when they say "make it look like this". Extraction closes that, and grows
   * the library from what studios show us rather than what an engineer had
   * time to draw.
   *
   * Held to the same gate as a hand-authored layout: a misread arrangement is
   * refused rather than applied to real posts.
   */
  async layoutFromReference(tenantId: string, reference: Buffer, label = 'reference'): Promise<PostTemplate | null> {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) return null;
    try {
      const key = extractedKey(label);
      const extracted = await extractLayout({ apiKey, reference, key });
      if (!extracted) {
        this.logger.warn('[layout] reference produced no usable arrangement');
        return null;
      }
      const { template, errors } = validateStored(extracted);
      if (!template || errors.length) {
        this.logger.warn(`[layout] extracted layout refused — ${errors.join('; ')}`);
        return null;
      }
      const row = toStored(template);
      await this.prisma.geminiLabTemplate.create({
        data: { ...row, allows: row.allows as any, source: 'reference', tenantId },
      });
      this.logger.log(`[layout] extracted "${template.name}" (${template.photoMode}) from a reference for tenant=${tenantId}`);
      return template;
    } catch (err) {
      // A reference is an enhancement — failing to read one must never stop a
      // generation, it just means the shared library carries the post.
      this.logger.warn(`[layout] could not extract from reference: ${(err as Error).message}`);
      return null;
    }
  }

  async scanWebsite(tenantId: string, url: string): Promise<WebsiteScanResult> {
    this.assertEnabled();
    const key = createHash('sha1').update(url.trim().toLowerCase()).digest('hex');
    return this.cached(`scan:${tenantId}:${key}`, () => scanWebsiteForBrandDna(url));
  }

  /**
   * Adjusts the whole brand from one sentence of intent.
   *
   * Deliberately not cached: saying "warmer" twice should move the brand
   * twice, not replay the first answer.
   */
  async adjustBrand(tenantId: string, raw: unknown, wish: string) {
    this.assertEnabled();
    const text = String(wish ?? '').trim();
    if (!text) throw new BadRequestException('Say what you want changed.');
    return adjustBrand(raw, text);
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

