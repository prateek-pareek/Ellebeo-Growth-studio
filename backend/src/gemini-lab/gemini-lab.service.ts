import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import type { GeminiLabGenerateDto } from './dto/gemini-lab.dto';
import {
  DEFAULT_LAB_PALETTE,
  logoPositionFromBrand,
  normalizeLogoLockup,
  paletteFromBrand,
  prepareLabPhoto,
  renderLabSlide,
  type LabLayout,
  type LabSlideSpec,
} from './gemini-lab-compositor';

type SlidePlan = { index: number; label: string; layout: LabLayout; photo: LabSlideSpec['photo'] };

type GeneratedSlide = {
  index: number;
  label: string;
  imageDataUrl: string;
  notes: string | null;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_MODEL = 'gemini-2.5-flash';

@Injectable()
export class GeminiLabService {
  private readonly logger = new Logger(GeminiLabService.name);

  constructor(private readonly prisma: PrismaService) {}

  async generate(params: {
    tenantId: string;
    dto: GeminiLabGenerateDto;
    files: {
      templateRef?: Express.Multer.File;
      photo?: Express.Multer.File;
      photo2?: Express.Multer.File;
    };
  }) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) {
      throw new ServiceUnavailableException('GEMINI_API_KEY is not configured on this server');
    }

    const useBrandDna = params.dto.useBrandDna !== false;
    const brandDna = useBrandDna
      ? await this.prisma.brandDNA.findUnique({
          where: { unique_current_brand_dna: { tenantId: params.tenantId, isCurrent: true } },
        })
      : null;
    if (useBrandDna && !brandDna) {
      throw new BadRequestException('Brand DNA is on for this run. Set it up, or turn Use Brand DNA off.');
    }

    const template = params.dto.templateSlug
      ? await this.prisma.template.findFirst({
          where: {
            isActive: true,
            ...(UUID_RE.test(params.dto.templateSlug)
              ? { OR: [{ id: params.dto.templateSlug }, { slug: params.dto.templateSlug }] }
              : { slug: params.dto.templateSlug }),
          },
        })
      : null;

    const photoARaw = await this.resolvePhoto(params.files.photo, params.dto.appointmentId, params.tenantId, 'before');
    const photoBRaw = await this.resolvePhoto(params.files.photo2, params.dto.appointmentId, params.tenantId, 'after');
    const photoA = photoARaw ? await prepareLabPhoto(photoARaw) : undefined;
    const photoB = photoBRaw ? await prepareLabPhoto(photoBRaw) : undefined;
    if (!photoA && !photoB) {
      throw new BadRequestException('Add at least one photo — a finished look, behind the scenes, detail, or before/after.');
    }
    const kindA = normalizePhotoKind(params.dto.photo1Kind, params.files.photo ? undefined : params.dto.appointmentId ? 'before' : 'look');
    const kindB = photoB
      ? normalizePhotoKind(params.dto.photo2Kind, params.files.photo2 ? undefined : params.dto.appointmentId ? 'after' : 'look')
      : null;
    const isPair = isBeforeAfterPair(kindA, kindB);
    if (
      isMedicalFromBrand(brandDna) &&
      (params.dto.appointmentId || kindA === 'before' || kindA === 'after' || kindB === 'before' || kindB === 'after')
    ) {
      throw new BadRequestException(
        'Medical-aesthetics compliance is on. Client before/after photos cannot be used in Gemini Lab. Use a studio or behind-the-scenes shot instead.',
      );
    }

    const logoUrl = logoUrlFromBrand(brandDna);
    let logoBuf: Buffer | undefined;
    if (logoUrl) {
      try {
        logoBuf = await normalizeLogoLockup(await fetchImageBuffer(logoUrl));
      } catch (err) {
        this.logger.warn(`Could not load brand logo: ${(err as Error).message}`);
      }
    }
    const logoPosition = brandDna ? logoPositionFromBrand(brandDna) : 'bottom_right';

    const aspectRatio = params.dto.aspectRatio ?? '4:5';
    const plan = this.buildSlidePlan(template, {
      overlayText: params.dto.overlayText,
      hasA: !!photoA,
      hasB: !!photoB,
      isPair,
      requestedSlideCount: params.dto.slideCount,
    });

    const model = process.env['GEMINI_MODEL'] || TEXT_MODEL;
    this.logger.log(`Gemini Lab composite tenant=${params.tenantId} slides=${plan.length} model=${model}`);

    const copyByIndex = await this.writeSlideCopy({
      apiKey,
      model,
      brandDna,
      template,
      overlayText: params.dto.overlayText,
      extraNotes: params.dto.extraNotes,
      plan,
      photoA,
      photoB,
      kindA,
      kindB,
    });

    const palette = brandDna ? paletteFromBrand(brandDna) : DEFAULT_LAB_PALETTE;
    const slides: GeneratedSlide[] = [];
    const failures: string[] = [];

    for (const slide of plan) {
      try {
        const copy = copyByIndex.get(slide.index);
        const spec: LabSlideSpec = {
          layout: slide.layout,
          headline: cleanCopy(copy?.headline, 42) || fallbackHeadline(slide),
          subhead: cleanCopy(copy?.subhead, 72) || undefined,
          pill: cleanCopy(copy?.pill, 22)?.toUpperCase() || fallbackPill(slide),
          cta: cleanCopy(copy?.cta, 22) || undefined,
          photo: slide.photo,
          leftPill: pillLabel(kindA),
          rightPill: pillLabel(kindB),
        };
        const png = await renderLabSlide({
          spec,
          aspectRatio,
          palette,
          before: photoA,
          after: photoB,
          logo: logoBuf,
          logoPosition,
        });
        slides.push({
          index: slide.index,
          label: slide.label,
          imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
          notes: null,
        });
      } catch (err) {
        failures.push(`${slide.label}: ${(err as Error).message}`);
      }
    }

    if (slides.length === 0) {
      throw new ServiceUnavailableException(failures.join(' · ') || 'Could not composite slides');
    }

    return {
      model: `${model}+sharp`,
      aspectRatio,
      imageDataUrl: slides[0].imageDataUrl,
      slides,
      notes: failures.length ? `Some slides failed: ${failures.join(' · ')}` : 'Original photos were composited unchanged. Gemini wrote the copy only.',
      prompt: null,
      used: {
        brand: brandDna?.businessName ?? null,
        brandDna: !!brandDna,
        templateSlug: template?.slug ?? null,
        templateName: template?.name ?? null,
        format: template?.format ?? null,
        slideCount: plan.length,
        references: [
          photoA ? `PHOTO 1 · ${kindLabel(kindA)} (original pixels)` : null,
          photoB ? `PHOTO 2 · ${kindLabel(kindB)} (original pixels)` : null,
          logoBuf ? 'BRAND LOGO' : null,
          brandDna ? 'PRODUCTION BRAND DNA' : 'BRAND DNA BYPASSED',
        ].filter(Boolean),
      },
    };
  }

  private async resolvePhoto(
    file: Express.Multer.File | undefined,
    appointmentId: string | undefined,
    tenantId: string,
    kind: 'before' | 'after',
  ): Promise<Buffer | undefined> {
    if (file?.buffer) return file.buffer;
    if (!appointmentId) return undefined;
    const apt = await this.prisma.appointment.findFirst({
      where: { id: appointmentId, tenantId, deletedAt: null },
      include: { imageAssets: { where: { deletedAt: null } } },
    });
    if (!apt) throw new BadRequestException('Appointment not found');
    const url = apt.imageAssets.find((i) => (kind === 'before' ? i.isBeforePhoto : i.isAfterPhoto))?.rawUrl;
    return url ? fetchImageBuffer(url) : undefined;
  }

  private buildSlidePlan(
    template: { format: string; slideCount: number | null; zones: unknown; name: string } | null,
    ctx: { overlayText?: string; hasA: boolean; hasB: boolean; isPair: boolean; requestedSlideCount?: number },
  ): SlidePlan[] {
    const format = (template?.format || '').toLowerCase();
    const isCarousel = format === 'carousel';
    const isStory = format === 'story';
    const requested = template
      ? (template.slideCount ?? (isCarousel ? 3 : isStory ? 4 : 1))
      : (ctx.requestedSlideCount ?? 1);
    const count = template
      ? (isCarousel
        ? Math.min(5, Math.max(1, requested || 3))
        : isStory
          ? Math.min(4, Math.max(1, requested || 1))
          : 1)
      : Math.min(5, Math.max(1, requested || 1));

    const zones = Array.isArray(template?.zones) ? (template!.zones as Array<{ label?: string }>) : [];
    const labels = count <= 1
      ? [template?.name || 'Post']
      : zones.length >= count
        ? zones.slice(0, count).map((z, i) => z.label || `Slide ${i + 1}`)
        : Array.from({ length: count }, (_, i) => defaultCarouselLabel(i, count, ctx.isPair));

    return labels.map((label, i) => ({
      index: i,
      label: count > 1 ? `${String(i + 1).padStart(2, '0')} · ${label}` : label,
      layout: layoutFor(label, i, count, ctx.hasA, ctx.hasB, ctx.isPair),
      photo: photoFor(label, i, count, ctx.hasA, ctx.hasB, ctx.isPair),
    }));
  }

  private async writeSlideCopy(params: {
    apiKey: string;
    model: string;
    brandDna: any | null;
    template: { name: string; slug: string; format: string; description: string | null } | null;
    overlayText?: string;
    extraNotes?: string;
    plan: SlidePlan[];
    photoA?: Buffer;
    photoB?: Buffer;
    kindA: PhotoKind;
    kindB: PhotoKind | null;
  }): Promise<Map<number, { headline: string; subhead?: string; pill?: string; cta?: string }>> {
    const map = new Map<number, { headline: string; subhead?: string; pill?: string; cta?: string }>();
    try {
      const vision: Array<Record<string, unknown>> = [];
      if (params.photoA) {
        vision.push({ text: `[PHOTO 1 — ${kindLabel(params.kindA).toUpperCase()} — original pixels, do not generate a new photo]` });
        vision.push({ inlineData: { mimeType: 'image/jpeg', data: await thumbJpeg(params.photoA) } });
      }
      if (params.photoB) {
        vision.push({ text: `[PHOTO 2 — ${kindLabel(params.kindB).toUpperCase()} — original pixels, do not generate a new photo]` });
        vision.push({ inlineData: { mimeType: 'image/jpeg', data: await thumbJpeg(params.photoB) } });
      }

      const slidesJson = params.plan.map((s) => ({
        index: s.index,
        label: s.label,
        layout: s.layout,
      }));

      const dna = params.brandDna;
      const brandLock = dna
        ? [
            `BRAND DNA IS LAW — use this exact brand, not a generic salon:`,
            ...labBrandLockFromDna(dna),
            `- Do not mention a logo, wordmark, or colour hex. The logo is stamped from Brand DNA and must be identical on every slide.`,
            `- Do not invent a different salon name, tagline, or offer.`,
          ]
        : [
            `BRAND DNA IS BYPASSED for this run.`,
            `- Do not invent a salon name, logo, wordmark, or colour hex.`,
            `- Write generic, premium beauty/marketing copy. No branded lockup.`,
          ];
      const prompt = [
        `You write ON-IMAGE copy only. You do not design logos, colours, or photos.`,
        `Return JSON only: {"slides":[{"index":0,"headline":"","subhead":"","pill":"","cta":""}]}`,
        `Write like a studio Instagram ad, not a blog caption.`,
        `headline: 3–6 words, two short lines max. Specific, premium. No quotes, no emoji, no filler ("the result", "amazing", "transformation").`,
        `subhead: max 8 words, one line. pill: 1–2 words, all caps. cta: max 3 words or "".`,
        params.kindA === 'before' && params.kindB === 'after'
          ? `Photos are a before/after pair. Only then use transformation language.`
          : `Do not assume these are before/after shots. Copy should match the photo kinds (look, behind the scenes, detail). No fake transformation claims.`,
        ...brandLock,
        `- No medical claims. No invented results.`,
        params.template ? `Template: ${params.template.name} — ${params.template.description || ''}` : '',
        params.overlayText ? `User overlay text (prefer this on slide 0 headline): ${params.overlayText}` : '',
        params.extraNotes ? `Notes: ${params.extraNotes}` : '',
        `Slides: ${JSON.stringify(slidesJson)}`,
      ].filter(Boolean).join('\n');

      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(params.model)}:generateContent?key=${encodeURIComponent(params.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: prompt }, ...vision] }],
            generationConfig: { responseMimeType: 'application/json', temperature: 0.45 },
          }),
        },
      );
      const json = await res.json() as any;
      if (!res.ok) throw new Error(json?.error?.message || res.statusText);
      const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
      const parsed = JSON.parse(text.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim());
      const rows = Array.isArray(parsed?.slides) ? parsed.slides : [];
      for (const row of rows) {
        if (typeof row?.index === 'number') {
          map.set(row.index, {
            headline: String(row.headline || '').trim(),
            subhead: String(row.subhead || '').trim() || undefined,
            pill: String(row.pill || '').trim() || undefined,
            cta: String(row.cta || '').trim() || undefined,
          });
        }
      }
    } catch (err) {
      this.logger.warn(`Copy generation fell back: ${(err as Error).message}`);
    }
    return map;
  }
}

function cleanCopy(value: string | undefined, maxChars: number): string | undefined {
  if (!value) return undefined;
  const text = value
    .replace(/^[“”"«»]+|[“”"«»]+$/g, '')
    .replace(/\s+/g, ' ')
    .replace(/[\u{1F300}-\u{1FAFF}]/gu, '')
    .trim();
  if (!text) return undefined;
  return text.length > maxChars ? text.slice(0, maxChars).replace(/\s+\S*$/, '').trim() : text;
}

type PhotoKind = 'look' | 'bts' | 'before' | 'after' | 'detail';

function normalizePhotoKind(raw: string | undefined, fallback: PhotoKind = 'look'): PhotoKind {
  if (raw === 'look' || raw === 'bts' || raw === 'before' || raw === 'after' || raw === 'detail') return raw;
  return fallback;
}

function isBeforeAfterPair(a: PhotoKind, b: PhotoKind | null): boolean {
  if (!b) return false;
  return (a === 'before' && b === 'after') || (a === 'after' && b === 'before');
}

function kindLabel(kind: PhotoKind | null | undefined): string {
  if (kind === 'bts') return 'Behind the scenes';
  if (kind === 'before') return 'Before';
  if (kind === 'after') return 'After';
  if (kind === 'detail') return 'Detail';
  return 'Finished look';
}

function pillLabel(kind: PhotoKind | null | undefined): string {
  if (kind === 'bts') return 'BTS';
  if (kind === 'before') return 'BEFORE';
  if (kind === 'after') return 'AFTER';
  if (kind === 'detail') return 'DETAIL';
  return 'LOOK';
}

function layoutFor(label: string, index: number, count: number, hasA: boolean, hasB: boolean, isPair: boolean): LabLayout {
  const l = label.toLowerCase();
  if (count === 1) return isPair && hasA && hasB ? 'split' : 'cover';
  if (/before\s*&\s*after|split|transformation/.test(l) && isPair && hasA && hasB) return 'split';
  if (/cta|book/.test(l) || (count > 1 && index === count - 1)) return 'framed_cta';
  if (/step|technique|educat/.test(l)) return 'type_step';
  if (index === 0) return 'cover';
  if (index === 1 && isPair && hasA && hasB) return 'split';
  return 'banner';
}

function photoFor(label: string, index: number, count: number, hasA: boolean, hasB: boolean, isPair: boolean): LabSlideSpec['photo'] {
  const l = label.toLowerCase();
  if (/before\s*&\s*after|split/.test(l) && isPair && hasA && hasB) return 'both';
  if (isPair && /before|start/.test(l) && hasA) return 'before';
  if (hasA && hasB) return index % 2 === 0 ? 'before' : 'after';
  return hasA ? 'before' : 'after';
}

function defaultCarouselLabel(index: number, count: number, isPair: boolean): string {
  if (index === 0) return 'Cover';
  if (index === 1 && count >= 3) return isPair ? 'Before & after' : 'Look';
  if (index === count - 1) return 'CTA';
  return `Step ${index}`;
}

function fallbackHeadline(slide: SlidePlan): string {
  if (slide.layout === 'split') return 'The transformation';
  if (slide.layout === 'framed_cta') return 'Ready when you are';
  if (slide.layout === 'type_step') return 'How we got here';
  return 'The look';
}

function fallbackPill(slide: SlidePlan): string {
  if (slide.layout === 'split') return 'BEFORE';
  if (slide.layout === 'framed_cta') return 'BOOK';
  if (slide.layout === 'type_step') return 'STEP';
  return 'LOOK';
}

function parseV2(dna: any): Record<string, any> | null {
  const raw = dna?.brandDnaV2;
  if (!raw) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? raw : null;
}

function logoUrlFromBrand(dna: any): string | null {
  if (!dna) return null;
  const v2 = parseV2(dna);
  return dna.logoUrl || v2?.logo_asset_url || v2?.logo_storage_path || null;
}

function isMedicalFromBrand(dna: any): boolean {
  if (!dna) return false;
  const v2 = parseV2(dna);
  if (v2?.compliance?.medical_aesthetics_practitioner === true) return true;
  const cats: string[] = Array.isArray(dna.serviceCategories) ? dna.serviceCategories : [];
  return cats.includes('medical_aesthetics') || cats.includes('injectables_cosmetic') || cats.includes('laser_treatments');
}

function labBrandLockFromDna(dna: any): string[] {
  const v2 = parseV2(dna);
  const f = v2?.foundations || {};
  const e = v2?.essence || {};
  const vis = v2?.visual_identity || {};
  const voice = v2?.voice_v2 || {};
  const written = v2?.written_conventions || {};
  const commercial = v2?.commercial || {};
  const client = v2?.ideal_client_v2 || {};
  const sig = v2?.signature_system || {};
  const pal = vis.palette || {};
  const preferred = [
    ...(Array.isArray(dna.vocabularyPreferred) ? dna.vocabularyPreferred : []),
    voice.vocabulary ? String(voice.vocabulary) : '',
  ].filter(Boolean).join(', ');
  const banned = [
    ...(Array.isArray(dna.vocabularyBlacklist) ? dna.vocabularyBlacklist : []),
    ...(Array.isArray(dna.doNotSay) ? dna.doNotSay : []),
    ...(Array.isArray(written.avoid_phrases) ? written.avoid_phrases : []),
  ].filter(Boolean).join(', ');
  const name = f.professional_name || dna.businessName;
  return [
    `- Business name (never change it): ${name}`,
    f.niche ? `- Niche: ${f.niche}` : '',
    f.known_for ? `- Known for: ${f.known_for}` : dna.oneLiner ? `- One-liner: ${dna.oneLiner}` : '',
    f.what_makes_different ? `- What makes you different: ${f.what_makes_different}` : '',
    e.one_sentence ? `- Brand essence: ${e.one_sentence}` : dna.brandEssenceSentence ? `- Brand essence: ${dna.brandEssenceSentence}` : '',
    e.image_energy ? `- Image energy: ${String(e.image_energy).replace(/_/g, ' ')}` : '',
    voice.three_words ? `- Voice (3 words): ${voice.three_words}` : dna.primaryTone ? `- Tone: ${String(dna.primaryTone).replace(/_/g, ' ')}` : '',
    voice.caption_style ? `- Caption style: ${voice.caption_style}` : '',
    commercial.cta_style ? `- CTA style: ${commercial.cta_style}` : '',
    client.problem ? `- Speak to this client problem: ${client.problem}` : '',
    preferred ? `- Prefer these words: ${preferred}` : '',
    banned ? `- NEVER use: ${banned}` : '',
    written.spelling_variant ? `- Spelling: ${written.spelling_variant}` : '',
    sig.recurring_motif ? `- Signature motif: ${sig.recurring_motif}` : '',
    pal.primary || dna.primaryBrandColor
      ? `- Colours are applied in layout, not in copy. Do not name hexes.`
      : '',
    v2?.compliance?.medical_aesthetics_practitioner || isMedicalFromBrand(dna)
      ? `- COMPLIANCE ON: educational framing only. No treatment outcomes, no medical claims.`
      : '',
  ].filter(Boolean);
}

async function thumbJpeg(buffer: Buffer): Promise<string> {
  const out = await sharp(buffer).rotate().resize({ width: 640, height: 640, fit: 'inside' }).jpeg({ quality: 70 }).toBuffer();
  return out.toString('base64');
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('data:image/')) {
    return Buffer.from(url.split(',')[1] ?? '', 'base64');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching image`);
  return Buffer.from(await response.arrayBuffer());
}
