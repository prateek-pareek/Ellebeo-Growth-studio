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

type SlideCopy = { headline: string; subhead?: string; pill?: string; cta?: string };

type PostCaption = { hook: string; body: string; cta: string; hashtags: string[] };

type CopyPack = {
  source: 'gemini' | 'chatgpt';
  angle: string;
  byIndex: Map<number, SlideCopy>;
  caption: PostCaption;
};

type LabOption = {
  id: string;
  source: 'gemini' | 'chatgpt';
  label: string;
  angle: string;
  caption: PostCaption;
  slides: GeneratedSlide[];
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
    const openaiKey = process.env['OPENAI_API_KEY'];
    this.logger.log(`Gemini Lab composite tenant=${params.tenantId} slides=${plan.length} gemini=${model} chatgpt=${openaiKey ? 'gpt-4o' : 'off'}`);

    const packs = await this.writeCopyOptions({
      geminiKey: apiKey,
      geminiModel: model,
      openaiKey,
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
    const options: LabOption[] = [];
    const failures: string[] = [];

    for (const pack of packs) {
      const slides: GeneratedSlide[] = [];
      for (const slide of plan) {
        try {
          const copy = pack.byIndex.get(slide.index);
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
          failures.push(`${pack.source} ${pack.angle} · ${slide.label}: ${(err as Error).message}`);
        }
      }
      if (slides.length) {
        const n = options.filter((o) => o.source === pack.source).length + 1;
        options.push({
          id: `${pack.source}-${n}`,
          source: pack.source,
          label: `${pack.source === 'chatgpt' ? 'ChatGPT' : 'Gemini'} ${n}`,
          angle: pack.angle,
          caption: pack.caption,
          slides,
        });
      }
    }

    if (options.length === 0) {
      throw new ServiceUnavailableException(failures.join(' · ') || 'Could not composite slides');
    }

    const first = options[0];
    const sources = [...new Set(options.map((o) => o.source))].join('+');
    return {
      model: `${sources}+sharp`,
      aspectRatio,
      imageDataUrl: first.slides[0].imageDataUrl,
      slides: first.slides,
      options,
      notes: failures.length
        ? `Some options failed: ${failures.join(' · ')}`
        : `${options.length} post options. Photos composited unchanged. Copy from Gemini${openaiKey ? ' and ChatGPT' : ''}.`,
      prompt: null,
      used: {
        brand: brandDna?.businessName ?? null,
        brandDna: !!brandDna,
        templateSlug: template?.slug ?? null,
        templateName: template?.name ?? null,
        format: template?.format ?? null,
        slideCount: plan.length,
        optionCount: options.length,
        sources: options.map((o) => o.source),
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

  private async writeCopyOptions(params: {
    geminiKey: string;
    geminiModel: string;
    openaiKey?: string;
    brandDna: any | null;
    template: { name: string; slug: string; format: string; description: string | null } | null;
    overlayText?: string;
    extraNotes?: string;
    plan: SlidePlan[];
    photoA?: Buffer;
    photoB?: Buffer;
    kindA: PhotoKind;
    kindB: PhotoKind | null;
  }): Promise<CopyPack[]> {
    const thumbA = params.photoA ? await thumbJpeg(params.photoA) : null;
    const thumbB = params.photoB ? await thumbJpeg(params.photoB) : null;
    const prompt = buildCopyPrompt(params);

    const jobs: Array<Promise<CopyPack[]>> = [
      this.copyFromGemini(params.geminiKey, params.geminiModel, prompt, thumbA, thumbB, params.kindA, params.kindB),
    ];
    if (params.openaiKey) {
      jobs.push(this.copyFromChatGpt(params.openaiKey, prompt, thumbA, thumbB, params.kindA, params.kindB));
    }

    const settled = await Promise.allSettled(jobs);
    const packs: CopyPack[] = [];
    const seen = new Set<string>();
    for (const result of settled) {
      if (result.status === 'rejected') {
        this.logger.warn(`Copy provider failed: ${result.reason?.message || result.reason}`);
        continue;
      }
      for (const pack of result.value) {
        const key = [...pack.byIndex.values()].map((s) => s.headline.toLowerCase()).join('|');
        if (seen.has(key)) continue;
        seen.add(key);
        packs.push(pack);
      }
    }
    if (!packs.length) {
      packs.push({
        source: 'gemini',
        angle: 'Studio look',
        byIndex: new Map(),
        caption: { hook: '', body: '', cta: '', hashtags: [] },
      });
    }
    return packs;
  }

  private async copyFromGemini(
    apiKey: string,
    model: string,
    prompt: string,
    thumbA: string | null,
    thumbB: string | null,
    kindA: PhotoKind,
    kindB: PhotoKind | null,
  ): Promise<CopyPack[]> {
    const vision: Array<Record<string, unknown>> = [];
    if (thumbA) {
      vision.push({ text: `[PHOTO 1 — ${kindLabel(kindA).toUpperCase()}]` });
      vision.push({ inlineData: { mimeType: 'image/jpeg', data: thumbA } });
    }
    if (thumbB) {
      vision.push({ text: `[PHOTO 2 — ${kindLabel(kindB).toUpperCase()}]` });
      vision.push({ inlineData: { mimeType: 'image/jpeg', data: thumbB } });
    }
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }, ...vision] }],
          generationConfig: { responseMimeType: 'application/json', temperature: 0.72 },
        }),
      },
    );
    const json = await res.json() as any;
    if (!res.ok) throw new Error(json?.error?.message || res.statusText);
    const text = json?.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
    return parseCopyPacks(text, 'gemini');
  }

  private async copyFromChatGpt(
    apiKey: string,
    prompt: string,
    thumbA: string | null,
    thumbB: string | null,
    kindA: PhotoKind,
    kindB: PhotoKind | null,
  ): Promise<CopyPack[]> {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    if (thumbA) {
      content.push({ type: 'text', text: `PHOTO 1 — ${kindLabel(kindA)}` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbA}` } });
    }
    if (thumbB) {
      content.push({ type: 'text', text: `PHOTO 2 — ${kindLabel(kindB)}` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbB}` } });
    }
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: process.env['OPENAI_LAB_MODEL'] || 'gpt-4o',
        temperature: 0.72,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: 'You are a senior social copywriter for premium hair and beauty studios. Return JSON only.' },
          { role: 'user', content },
        ],
      }),
    });
    const json = await res.json() as any;
    if (!res.ok) throw new Error(json?.error?.message || res.statusText);
    const text = json?.choices?.[0]?.message?.content || '';
    return parseCopyPacks(text, 'chatgpt');
  }
}

function buildCopyPrompt(params: {
  brandDna: any | null;
  template: { name: string; slug: string; format: string; description: string | null } | null;
  overlayText?: string;
  extraNotes?: string;
  plan: SlidePlan[];
  kindA: PhotoKind;
  kindB: PhotoKind | null;
}): string {
  const dna = params.brandDna;
  const brandLock = dna
    ? [
        `BRAND DNA IS LAW — write as this studio, not a generic salon:`,
        ...labBrandLockFromDna(dna),
        `- Never mention a logo, wordmark, or colour hex.`,
        `- Never invent a different salon name, tagline, or offer.`,
      ]
    : [
        `Brand DNA is off. Do not invent a salon name or logo.`,
        `Write premium beauty-studio copy that could sit on a quiet luxury feed.`,
      ];
  const slidesJson = params.plan.map((s) => ({ index: s.index, label: s.label, layout: s.layout }));
  return [
    `You are writing a finished Instagram post for a premium studio.`,
    `Look at the photo. Name what is actually there (colour, cut, texture, light, setting). Be specific.`,
    `Return JSON only:`,
    `{"options":[{"angle":"","slides":[{"index":0,"headline":"","subhead":"","pill":"","cta":""}],"caption":{"hook":"","body":"","cta":"","hashtags":[]}}]}`,
    `Write TWO options with different angles (e.g. craft/process vs desire/feeling). Headlines must not repeat.`,
    `ON-IMAGE copy:`,
    `- headline: 3–6 words, billboard-short, specific to THIS photo. No quotes, emoji, or filler ("the result", "new look", "amazing", "transformation" unless it is a true before/after).`,
    `- subhead: one line, max 8 words. Adds texture or place, not a second headline.`,
    `- pill: 1–2 words, all caps. cta: max 3 words or "".`,
    `CAPTION (the post people read under the image):`,
    `- hook: first line that stops the scroll. Not the headline repeated.`,
    `- body: 2–4 short sentences in the brand voice. Sound like a stylist, not an ad.`,
    `- cta: one soft booking line.`,
    `- hashtags: 4–6, no # prefix, mix of niche and local. No spam tags.`,
    params.kindA === 'before' && params.kindB === 'after'
      ? `Photos are a before/after pair. Transformation language is allowed.`
      : `Do not assume before/after. Photo 1 is ${kindLabel(params.kindA)}${params.kindB ? `; photo 2 is ${kindLabel(params.kindB)}` : ''}.`,
    ...brandLock,
    `- No medical claims. No invented results or prices.`,
    params.template ? `Template: ${params.template.name} — ${params.template.description || ''}` : '',
    params.overlayText ? `User overlay text (prefer this on slide 0 headline): ${params.overlayText}` : '',
    params.extraNotes ? `Notes: ${params.extraNotes}` : '',
    `Slides: ${JSON.stringify(slidesJson)}`,
  ].filter(Boolean).join('\n');
}

function parseCopyPacks(raw: string, source: CopyPack['source']): CopyPack[] {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  const parsed = JSON.parse(text);
  const rows = Array.isArray(parsed?.options)
    ? parsed.options
    : parsed?.slides
      ? [{ angle: 'Studio look', slides: parsed.slides, caption: parsed.caption }]
      : [];
  const packs: CopyPack[] = [];
  for (const row of rows.slice(0, 2)) {
    const byIndex = new Map<number, SlideCopy>();
    const slides = Array.isArray(row?.slides) ? row.slides : [];
    for (const slide of slides) {
      if (typeof slide?.index !== 'number') continue;
      byIndex.set(slide.index, {
        headline: String(slide.headline || '').trim(),
        subhead: String(slide.subhead || '').trim() || undefined,
        pill: String(slide.pill || '').trim() || undefined,
        cta: String(slide.cta || '').trim() || undefined,
      });
    }
    const cap = row?.caption || {};
    const hashtags = Array.isArray(cap.hashtags) ? cap.hashtags.map((h: unknown) => String(h).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8) : [];
    packs.push({
      source,
      angle: String(row?.angle || 'Studio look').trim().slice(0, 48) || 'Studio look',
      byIndex,
      caption: {
        hook: String(cap.hook || '').trim(),
        body: String(cap.body || '').trim(),
        cta: String(cap.cta || '').trim(),
        hashtags,
      },
    });
  }
  return packs;
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
