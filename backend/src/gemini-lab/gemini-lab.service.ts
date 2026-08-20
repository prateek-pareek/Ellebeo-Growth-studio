import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import type { GeminiLabGenerateDto, GeminiLabKeepDto, GeminiLabSelectionDto } from './dto/gemini-lab.dto';
import {
  brandPaletteIsUsable,
  clampDesignSpec,
  logoPositionFromBrand,
  normalizeLogoLockup,
  paletteFromBrand,
  paletteFromGuided,
  prepareLabPhoto,
  renderLabSlide,
  type LabComposition,
  type LabCompositionInput,
  type LabDecoration,
  type LabDesignSpec,
  type LabLayout,
  type LabPalette,
  type LabSlideSpec,
  type LabTypography,
  type LogoPosition,
  type MoodHint,
} from './gemini-lab-compositor';
import { coerceFormatContent, type FormatContent } from './gemini-lab-blocks';
import { finishPhotoPair, isPhotoFinish, type PhotoFinish } from './gemini-lab-photo';
import { auditOfferContent } from './offer-facts';
import { generatePoster } from './poster-generate';
import { renderWithAiLayout } from './ai-layout';
import { auditCopy, buildRepairPrompt, applyRepair } from './cliche';
import { findSubject, type SubjectBox } from './subject-box';
import { pickReference } from './reference-library';
import { readFileSync as fsReadRef } from 'fs';
import { dataUrlToPng, storePostImage, storageAvailable } from './post-library';
// The one import from the video module: a pure plan builder, no shared state.
import { buildSlideshowPlan } from '../ai/video/slideshow-plan-builder';
import { canEditPhoto, editPhoto, editedDisclosure, instructionIsInScope } from './photo-edit';
import { pickPaletteTreatment } from './palette-variation';
import { applyRevision, critiqueRender } from './design-critic';
import { pairingId, pickTypePairing } from './type-variation';
import { paletteFromTokens, tokensFromBrand, typographyFromTokens } from './brand-tokens';
import { resolveAllBlocks, type PromptBlockId, type PromptOverrides } from './prompt-registry';
import { TEMPLATES_BY_ID, compositionFromTemplate, type PostTemplate } from './templates';
import { BLOCK_KINDS, hasContentFor } from './gemini-lab-blocks';
import {
  POST_FORMATS,
  availableFormats,
  contentForFormat,
  contentSatisfiesFormat,
  describeMarket,
  isPostFormatId,
  marketContext,
  type MarketContext,
  type PostFormat,
  type PostFormatId,
} from './gemini-lab-formats';
import { GeminiLabDnaService } from './gemini-lab-dna.service';
import {
  MOOD_META,
  MOODS,
  PALETTE_SEEDS,
  TYPE_PAIRINGS,
  labComplianceBlocksClientPhotos,
  type GuidedDnaProfile,
} from './guided-dna/contract';
import { generateMoodArt } from './guided-dna/generate-art';
import { describeRecentLooks, signatureOf, type LookSignature } from './guided-dna/creative-memory';
import { ScoringGateService, type ScoringResult } from '../ai/services/scoring-gate.service';
import {
  LAB_DECORATIONS,
  LAB_LAYOUTS,
  buildOptionPlans,
  describePlan,
  slideLayout,
  type OptionPlan,
} from './creative-plan';

type ZoneType = 'photo' | 'text' | 'quote' | 'cta' | 'video';
type SlidePlan = { index: number; label: string; layout: LabLayout; photo: LabSlideSpec['photo']; zoneType: ZoneType | null };

type GeneratedSlide = {
  index: number;
  label: string;
  imageDataUrl: string;
  notes: string | null;
};

type SlideCopy = {
  headline: string;
  subhead?: string;
  pill?: string;
  cta?: string;
  layout?: LabLayout;
  decoration?: LabDecoration;
  designSpec?: Partial<LabDesignSpec>;
  composition?: LabCompositionInput;
  /** What KIND of post this is — the axis a viewer actually perceives as variety. */
  format?: PostFormatId;
  /** Content the chosen format needs beyond the four text roles (steps, price rows, a quote…). */
  content?: FormatContent;
};

type PostCaption = { hook: string; body: string; cta: string; hashtags: string[] };

type CopyPack = {
  source: 'gemini' | 'chatgpt';
  angle: string;
  byIndex: Map<number, SlideCopy>;
  caption: PostCaption;
  /**
   * The design axes assigned to this option server-side. Carried on the pack
   * so the renderer can ENFORCE them: the prompt asking for a full-bleed
   * option was never enough, and a plan that only exists in the prompt is a
   * suggestion, not a guarantee. See creative-plan.ts.
   */
  plan: OptionPlan;
};

/** What a copy provider returns, before its option is paired with the plan it was written from. */
type UnplannedPack = Omit<CopyPack, 'plan'>;

type QualityGateSummary = { passed: boolean; score: number; reason: string; failures: string[] };

type LabOption = {
  id: string;
  source: 'gemini' | 'chatgpt';
  label: string;
  angle: string;
  caption: PostCaption;
  slides: GeneratedSlide[];
  qualityGate: QualityGateSummary;
  /**
   * What this option actually IS, so the UI can label the difference between
   * options instead of showing four unexplained thumbnails. These are the
   * assigned axes, which is exactly the information a technician needs to
   * choose between them.
   */
  design: {
    format: string;
    photoMode: string;
    layout: string;
    photoShape: string;
    decoration: string;
    /** Returned so the client can tell us which treatment it chose, not just which option. */
    paletteTreatment: string;
    typePairing: string;
    templateId: string;
    /**
     * How this option was actually MADE. Until now this only existed in the
     * server log, so a studio could not tell whether it was looking at an
     * AI-designed page, a composited one, or a generated poster — and
     * therefore could not tell whether its templates were doing anything.
     */
    renderPath: 'ai_layout' | 'composited' | 'poster';
    /** The studio's own slide that supplied the arrangement, when one did. */
    referenceId: string | null;
  };
};

function summarizeGate(result: ScoringResult): QualityGateSummary {
  return { passed: result.passed, score: result.score, reason: result.reason, failures: result.failures };
}

/**
 * The studio's content objective, in the video pipeline's vocabulary.
 *
 * The two modules named the same ideas differently, so a reel built from a
 * brand's posts would otherwise be planned against a default objective that
 * has nothing to do with what the studio said it wanted.
 */
const VIDEO_OBJECTIVE: Record<string, 'fill_quiet_days' | 'premium_clients' | 'educate_trust' | 'social_proof' | 'promotion' | 'brand_awareness'> = {
  PREMIUM_CLIENTS: 'premium_clients',
  FILL_QUIET_DAYS: 'fill_quiet_days',
  EDUCATE_TRUST: 'educate_trust',
  PROMOTE_BRIDAL: 'promotion',
  LAUNCH_PRODUCT: 'promotion',
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TEXT_MODEL = 'gemini-2.5-flash';
/** How many options each copy provider is asked to write. parseCopyPacks caps at the same number. */
const OPTIONS_PER_PROVIDER = 2;

@Injectable()
export class GeminiLabService {
  private readonly logger = new Logger(GeminiLabService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly guidedDna: GeminiLabDnaService,
    private readonly scoringGate: ScoringGateService,
  ) {}

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
    const [brandDna, guidedProfile] = useBrandDna
      ? await Promise.all([
          this.prisma.brandDNA.findUnique({
            where: { unique_current_brand_dna: { tenantId: params.tenantId, isCurrent: true } },
          }),
          this.guidedDna.getCompletedProfile(params.tenantId),
        ])
      : [null, null];
    if (useBrandDna && !brandDna && !guidedProfile) {
      throw new BadRequestException('Brand DNA is on for this run. Set it up, or turn Use Brand DNA off.');
    }
    // Guided DNA v2 (mood/essence/audience/story) is the primary aesthetic
    // source once a tenant has completed it — it carries far more signal
    // than the legacy flat brandDNA row. Legacy stays as the fallback for
    // tenants who haven't done the guided flow yet, so nothing regresses.
    const dnaSource: 'guided' | 'legacy' | 'none' = guidedProfile ? 'guided' : brandDna ? 'legacy' : 'none';

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
    // No photo is now a supported case, not an error: a myth-buster, an
    // aftercare list, a price card or a celebration post doesn't need one, and
    // a generated studio still life carries it instead. Those formats existed
    // but were unreachable while this threw.
    const photoFreePost = !photoA && !photoB;
    const kindA = normalizePhotoKind(params.dto.photo1Kind, params.files.photo ? undefined : params.dto.appointmentId ? 'before' : 'look');
    const kindB = photoB
      ? normalizePhotoKind(params.dto.photo2Kind, params.files.photo2 ? undefined : params.dto.appointmentId ? 'after' : 'look')
      : null;
    const isPair = isBeforeAfterPair(kindA, kindB);
    if (
      (isMedicalFromBrand(brandDna) || labComplianceBlocksClientPhotos(guidedProfile)) &&
      (params.dto.appointmentId || kindA === 'before' || kindA === 'after' || kindB === 'before' || kindB === 'after')
    ) {
      throw new BadRequestException(
        'Medical-aesthetics compliance is on. Client before/after photos cannot be used in Gemini Lab. Use a studio or behind-the-scenes shot instead.',
      );
    }

    // Guided profile owns identity once it exists — logo/name are no longer
    // silently re-pulled from the legacy production record on every run.
    const logoUrl = guidedProfile ? guidedProfile.identity.logoUrl : logoUrlFromBrand(brandDna);
    let logoBuf: Buffer | undefined;
    if (logoUrl) {
      try {
        logoBuf = await normalizeLogoLockup(await fetchImageBuffer(logoUrl));
      } catch (err) {
        this.logger.warn(`Could not load brand logo: ${(err as Error).message}`);
      }
    }
    const logoPosition = guidedProfile ? 'bottom_right' : brandDna ? logoPositionFromBrand(brandDna) : 'bottom_right';

    const aspectRatio = params.dto.aspectRatio ?? '4:5';
    const plan = this.buildSlidePlan(template, {
      overlayText: params.dto.overlayText,
      // Truthful now that a photo-free post is a typographic poster rather
      // than an invented still life: claiming a photo the post does not have
      // would pick photo-led slide layouts for a poster.
      hasA: !!photoA,
      hasB: !!photoB,
      isPair,
      requestedSlideCount: params.dto.slideCount,
    });

    // Country/hemisphere/celebrations come from the tenant record that already
    // carries them — a "summer" campaign must resolve to December in Sydney
    // and July in London, and the studio's own festivals must be the ones on
    // offer. No schema change needed for multi-country support.
    const tenant = await this.prisma.tenant
      .findUnique({ where: { id: params.tenantId }, select: { locale: true, timezone: true } })
      .catch(() => null);

    const model = process.env['GEMINI_MODEL'] || TEXT_MODEL;
    const openaiKey = process.env['OPENAI_API_KEY'];
    this.logger.log(`Gemini Lab composite tenant=${params.tenantId} slides=${plan.length} gemini=${model} chatgpt=${openaiKey ? 'gpt-4o' : 'off'}`);

    // What this brand has been served recently — the one piece of context no
    // prompt could supply on its own, because the pipeline was stateless.
    const recentLooks = await this.guidedDna.getRecentLooks(params.tenantId);
    // This studio's own prompt edits. Empty for everyone who has not touched
    // them, in which case the shipped defaults apply and nothing changes.
    const promptOverrides = await this.guidedDna.getPromptOverrides(params.tenantId);
    // The salon's layout library: the shared set plus any of its own. Falls
    // back to the built-ins when the table has not been seeded.
    let library = await this.guidedDna.getTemplates(params.tenantId);
    // A style reference now shapes the ARRANGEMENT, not just the words and the
    // art texture. The extracted layout joins this run's library and is
    // strongly favoured, because it is the thing the technician asked for.
    let referenceLayoutId: string | null = null;
    if (params.files.templateRef?.buffer) {
      const extracted = await this.guidedDna.layoutFromReference(
        params.tenantId,
        params.files.templateRef.buffer,
        params.files.templateRef.originalname || 'reference',
      );
      if (extracted) {
        library = [extracted, ...library.filter((t) => t.id !== extracted.id)];
        referenceLayoutId = extracted.id;
      }
    }

    const packs = await this.writeCopyOptions({
      geminiKey: apiKey,
      geminiModel: model,
      openaiKey,
      brandDna,
      guidedProfile,
      template,
      overlayText: params.dto.overlayText,
      extraNotes: params.dto.extraNotes,
      plan,
      photoA,
      photoB,
      kindA,
      kindB,
      templateRefBuffer: params.files.templateRef?.buffer,
      recentLooks,
      locale: tenant?.locale,
      // Was passed on the RETRY pass only, so the first (and usually only)
      // pass resolved the market from locale alone — which every tenant here
      // leaves at the schema default en-AU. An Indian studio was therefore
      // told it was in the southern hemisphere and offered Melbourne Cup
      // instead of Diwali, exactly the failure countryFromTimezone exists to
      // prevent.
      timezone: tenant?.timezone,
      // No source of real prices/quotes/openings yet, so formats that would
      // have to assert one stay off. Inventing a price or a client testimonial
      // would publish a falsehood to a real studio's customers.
      hasFacts: false,
      // No longer true of this pipeline: a photo-free post is a typographic
      // poster, not generated imagery. Formats that need a real photograph
      // (statement, meet-the-artist) correctly stay off the menu without one.
      hasGeneratedImagery: false,
      requestedFormat: params.dto.postFormat,
      offerDetails: params.dto.offerDetails,
      testimonial: params.dto.testimonial,
      promptOverrides,
      library,
      referenceLayoutId,
    });

    // Filler the prompt asked it not to write, removed after the fact.
    //
    // The shipped instructions name these phrases and forbid them. A real run
    // with that wording in place still produced "bespoke" twice, "effortless",
    // "enhance your natural beauty", "experience the" and "radiant" across
    // three of three options, and a later run headlined a post "Effortless.
    // Truly You." An instruction is not a mechanism; this is the mechanism.
    await this.deClicheCopy(packs, apiKey, model);


    // No completed guided profile yet is common (most tenants haven't done
    // the wizard) — without a mood, typography/frame-style/decoration/art
    // all silently freeze on one fixed default look every single
    // generation, which is exactly the "same template every time" bug.
    // Same fallback philosophy as growth-studio-poc's tokens.ts: pick
    // randomly from the mood vocabulary per-request instead of one fixed
    // id, so there's real variety even before a brand profile exists.
    const mood: MoodHint = guidedProfile?.identity.mood ?? (MOODS[Math.floor(Math.random() * MOODS.length)] as MoodHint);
    // Gated on real colours, not on the row existing — an empty legacy row
    // otherwise pins every post to DEFAULT_LAB_PALETTE and blocks the mood
    // palette entirely (measured: this was the single biggest cause of
    // every generation looking identical).
    const brandPalette: LabPalette = guidedProfile
      ? paletteFromGuided(guidedProfile.identity.palette)
      : brandPaletteIsUsable(brandDna)
        ? paletteFromBrand(brandDna)
        : paletteFromGuided(PALETTE_SEEDS[mood as keyof typeof PALETTE_SEEDS] as unknown as string[]);
    // The brand palette is the SOURCE, not the finished treatment. Applying it
    // identically to every post is what made a salon's feed one temperature
    // for life; deriving a per-post treatment from the same five colours keeps
    // it on-brand while giving each post its own ground. See palette-variation.ts.
    const brandTypographySeed: LabTypography = guidedProfile
      ? guidedProfile.identity.typography
      : TYPE_PAIRINGS[mood as keyof typeof TYPE_PAIRINGS];
    // Brand as a structured token document (W3C Design Tokens), not a mood
    // enum. Derived from the profile today, so nothing changes — but the
    // renderer now reads brand from ONE typed source, which is what lets a
    // palette extracted from a logo, or a typeface a studio actually chose,
    // replace a seeded value later without touching anything downstream.
    const brandTokens = tokensFromBrand({
      palette: brandPalette,
      typography: brandTypographySeed,
      voice: {
        mood,
        essence: guidedProfile?.identity.essence ?? [],
        bannedWords: blacklistFromDna(brandDna),
        signatureMotif: guidedProfile?.offering.signatureHandle ?? null,
      },
    });
    const tokenPalette = paletteFromTokens(brandTokens, brandPalette);

    // A treatment PER OPTION, not per run.
    //
    // This used to be a single call whose result every option shared, so all
    // four posts in a run came back on the same ground — four duotone cards,
    // every run — which is most of what "the designs all look the same" meant.
    // Each pick is told what the run has already used, so the four options
    // spread across the treatments instead of landing on one.
    const usedTreatments = recentLooks
      .map((l) => l.paletteTreatment)
      .filter((t): t is string => !!t);
    // Both providers at two options each is the ceiling; paletteFor() indexes
    // modulo, so a shorter run simply uses the first few.
    const maxOptions = 2 * OPTIONS_PER_PROVIDER;
    const paletteTreatments = Array.from({ length: maxOptions }, () => {
      const picked = pickPaletteTreatment(tokenPalette, usedTreatments);
      usedTreatments.push(picked.id);
      return picked;
    });
    const paletteTreatment = paletteTreatments[0];
    const treatmentFor = (index: number) =>
      paletteTreatments[index % paletteTreatments.length] ?? paletteTreatment;
    const paletteFor = (index: number): LabPalette => treatmentFor(index).palette;
    const palette: LabPalette = paletteTreatment.palette;
    // One pairing per mood meant every post a salon ever made was set in the
    // same two faces — the loudest constant left, and on a typographic poster
    // the type IS the design. Varied within the mood's own character, and
    // weighted away from the pairings this brand saw recently.
    const typography = pickTypePairing(
      typographyFromTokens(brandTokens, brandTypographySeed),
      mood,
      recentLooks.map((l) => l.typePairing).filter((t): t is string => !!t),
    );

    // Variant is picked at random per request, not bucketed by day. The
    // disk cache in generate-art.ts is what actually bounds cost (a repeat
    // (mood, variant) is a free cache hit), so day-bucketing bought nothing
    // and pinned each mood to ONE image for 24h — pure repetition for no
    // saving. Random across 3 variants triples the pool at the same cost.
    // A post with no client photo needs a SUBJECT, not a backdrop. One
    // generated still life carries the whole post, so this replaces the
    // background-art call rather than adding to it — same one image
    // generation per request, no extra latency.
    // A post with no uploaded photo is now a designed POSTER, not an invented
    // photograph. Every option in that case is planned as `typographic` (see
    // creative-plan.ts), so there is no hero image to manufacture: the
    // generated-still-life call is gone from this path along with the hard
    // failure it could raise when the image service was having a bad minute.
    // A price list or a sale never wanted a decorative photo behind it anyway.
    const needsHeroImage = packs.some((pack) => pack.plan.photoMode !== 'typographic');
    if (photoFreePost) {
      this.logger.log(
        `Gemini Lab photo-free post — ${packs.length} option(s) set typographically, no image generated`,
      );
    }

    let backgroundArt: Buffer | undefined;
    // Still generated for a poster: it is the same single image call the photo
    // path already makes, and an on-mood ground beats flat colour behind large
    // type. Suppressed only when a photo already fills the frame.
    // Skipped when nothing will use it. A run whose options are all posters
    // has nowhere to put background art now that posters sit on their own
    // colour ground — generating it anyway was a paid image call per run,
    // thrown away.
    // Generated art is for type-led pages, not for pages built around a client
    // photograph.
    //
    // Behind large type an on-mood ground beats flat colour. Behind a framed
    // client photo it is a second image competing with the first: a real run
    // returned a muddy grey-brown texture under a cream-and-sage brand, with
    // the client a small circle floating on it. When there is a photograph,
    // the studio's own paper colour is the right ground — it is the one thing
    // guaranteed to match, because it IS the brand.
    const anyOptionUsesArt =
      !photoA &&
      packs.some(
        (pack) => pack.plan.photoMode !== 'typographic' && pack.plan.photoMode !== 'full_bleed',
      );
    if (anyOptionUsesArt) try {
      // Was 0-2, which — because the art cache is keyed on the prompt and the
      // prompt is a pure function of (mood, essence, variant, aspect) — gave
      // every salon exactly three background images for life. A wide seed
      // makes the pool combinatorial; the disk cache still pays off whenever
      // a seed genuinely repeats.
      const variantIndex = Math.floor(Math.random() * 1_000_000);
      // The technician's own style-reference upload (never the client
      // photo) now genuinely shapes the generated art's palette/texture/mood
      // instead of only informing the copy/layout prompt.
      // Generated at the CANVAS aspect. Previously the model returned a
      // square (or 896x1152) and the compositor cover-resized it to 1080x1350
      // — a 17-32% upscale plus a crop on every post, which both softened the
      // whole background and cut away the calm negative space the art prompt
      // asks for precisely so the text has somewhere legible to sit.
      backgroundArt = (await generateMoodArt(
        mood,
        guidedProfile?.identity.essence ?? [],
        variantIndex,
        params.files.templateRef?.buffer,
        aspectRatio,
      )) ?? undefined;
    } catch (err) {
      this.logger.warn(`Background art generation failed, falling back to gradient: ${(err as Error).message}`);
    }

    // Genuinely random per generation, not cached/bucketed — picking among
    // precomputed style parameters costs nothing, unlike backgroundArt's
    // paid API call, so there's no reason to bound this to once-per-day.
    const frameVariantIndex = Math.floor(Math.random() * 3);
    // Photo finishing. Global tonal correction only — exposure, white balance,
    // contrast, sharpening. Nothing about the person changes, and a
    // before/after pair is graded ONCE and applied to both frames so the
    // "after" can never look better merely because it was measured separately.
    const photoFinish: PhotoFinish = isPhotoFinish(params.dto.photoFinish) ? params.dto.photoFinish : 'off';
    let finishedA = photoA;
    let finishedB = photoB;
    if (photoFinish !== 'off' && photoA) {
      try {
        const finished = await finishPhotoPair(photoA, photoB, { finish: photoFinish, mood });
        finishedA = finished.before;
        finishedB = finished.after ?? photoB;
        if (finished.applied.length) {
          this.logger.log(`[photo] finish=${photoFinish} — ${finished.applied.join(', ')}`);
        }
      } catch (err) {
        this.logger.warn(`Photo finishing failed, using the original: ${(err as Error).message}`);
      }
    }

    // The generated still life becomes the hero image for a photo-free post.
    // Downstream it is treated exactly like an uploaded photo — composited,
    // never re-generated — so the renderer, the framing and the quality
    // gate's asset-integrity check all work unchanged.
    const heroPhotoA = finishedA;

    // Where the person is in the hero photograph.
    //
    // One vision call, cached on the image hash, so four options from one
    // upload cost a single call. Every crop downstream is aimed at this
    // instead of sharp's attention heuristic, which finds the highest-entropy
    // region — on a portrait, as often the patterned scarf or the bright
    // window as the face. "Type crowds the photo subject's face" was six of
    // ten distinct critic complaints and this is the input that fixes it.
    //
    // A failure here is not a failure of the post: null returns every crop to
    // exactly the behaviour it had before.
    let subject: Awaited<ReturnType<typeof findSubject>> = null;
    if (heroPhotoA) {
      subject = await findSubject({ apiKey, photo: heroPhotoA });
      this.logger.log(
        subject
          ? `[subject] ${subject.kind} at ${(subject.x * 100).toFixed(0)},${(subject.y * 100).toFixed(0)} ` +
            `${(subject.w * 100).toFixed(0)}x${(subject.h * 100).toFixed(0)}% — crops aimed at it`
          : '[subject] not found — cropping by saliency as before',
      );
    }

    const renderCtx = { plan, aspectRatio, palette, paletteFor, subject, photoA: heroPhotoA, photoB: finishedB, logoBuf, logoPosition, typography, mood, kindA, kindB, backgroundArt, frameVariantIndex, offerDetails: params.dto.offerDetails, criticKey: apiKey, library,
      // Posts with no client photograph are generated, not composited.
      generatePosters: true,
      posterKey: apiKey,
      // The studio's own instruction, so a generated poster follows it too.
      extraNotes: params.dto.extraNotes,
      // Opt-in until it has been compared against the composited path.
      aiLayoutKey: process.env['GEMINI_LAB_AI_LAYOUT'] === '1' ? apiKey : undefined,
      brandName: guidedProfile?.identity.brandName || brandDna?.businessName || null,
      essence: guidedProfile?.identity.essence ?? [],
      serviceAreas: guidedProfile?.offering.serviceAreas ?? [],
      testimonial: params.dto.testimonial,
    };
    const failures: string[] = [];

    const rendered: Array<{ pack: CopyPack; slides: GeneratedSlide[]; compositions: LabComposition[]; renderedBy?: Map<number, { path: 'ai_layout' | 'composited' | 'poster'; referenceId: string | null }> }> = [];
    // Rendered in parallel. Sequentially, each option costs a render plus a
    // vision critique plus a re-render, and the measured total pushed a
    // two-option run past the client's timeout — the request was still
    // working server-side when the browser had already given up. The options
    // are fully independent, so there was never a reason to queue them.
    const renderedPacks = await Promise.all(packs.map((pack) => this.renderPack(pack, renderCtx)));
    packs.forEach((pack, i) => {
      const result = renderedPacks[i];
      failures.push(...result.failures);
      if (result.slides.length) rendered.push({ pack, slides: result.slides, compositions: result.compositions, renderedBy: result.renderedBy });
    });
    if (rendered.length === 0) {
      throw new ServiceUnavailableException(failures.join(' · ') || 'Could not composite slides');
    }

    // Self-critique: judge each rendered option's primary slide against the
    // same rubric the old orchestrator pipeline uses (brand fit, visual
    // quality, compliance, face/text-overlap safety, etc). Only worth a
    // retry when EVERY option came back bad — if something already passed,
    // the badges guide the user's choice and a retry would just burn extra
    // latency/cost for no benefit.
    const blacklist = blacklistFromDna(brandDna);
    const evalCtx = { photoA: heroPhotoA, photoB: finishedB, isPair, plan, tenantId: params.tenantId };
    let gated = await Promise.all(
      rendered.map(async (r) => ({ ...r, qualityGate: await this.evaluateOption(r, evalCtx, blacklist) })),
    );
    let retried = false;
    if (gated.every((g) => !g.qualityGate.passed)) {
      const feedback = gated
        .map((g) => `${g.pack.source} "${g.pack.angle}": ${g.qualityGate.reason}${g.qualityGate.failures.length ? ' — ' + g.qualityGate.failures.join('; ') : ''}`)
        .join('\n');
      try {
        const retryPacks = await this.writeCopyOptions({
          geminiKey: apiKey,
          geminiModel: model,
          openaiKey,
          brandDna,
          guidedProfile,
          template,
          overlayText: params.dto.overlayText,
          extraNotes: params.dto.extraNotes,
          plan,
          photoA,
          photoB,
          kindA,
          kindB,
          templateRefBuffer: params.files.templateRef?.buffer,
          retryFeedback: feedback,
          // The retry must see the same format universe as the first pass —
          // without these it silently offered a different set of formats.
          recentLooks,
          locale: tenant?.locale,
          timezone: tenant?.timezone,
          hasFacts: false,
          // No longer true of this pipeline: a photo-free post is a typographic
      // poster, not generated imagery. Formats that need a real photograph
      // (statement, meet-the-artist) correctly stay off the menu without one.
      hasGeneratedImagery: false,
          requestedFormat: params.dto.postFormat,
          offerDetails: params.dto.offerDetails,
          testimonial: params.dto.testimonial,
          promptOverrides,
          library,
          referenceLayoutId,
        });
        const retryRendered: Array<{ pack: CopyPack; slides: GeneratedSlide[]; compositions: LabComposition[]; renderedBy?: Map<number, { path: 'ai_layout' | 'composited' | 'poster'; referenceId: string | null }> }> = [];
        const retryResults = await Promise.all(retryPacks.map((pack) => this.renderPack(pack, renderCtx)));
        retryPacks.forEach((pack, i) => {
          const result = retryResults[i];
          failures.push(...result.failures);
          if (result.slides.length) retryRendered.push({ pack, slides: result.slides, compositions: result.compositions, renderedBy: result.renderedBy });
        });
        if (retryRendered.length) {
          gated = await Promise.all(
            retryRendered.map(async (r) => ({ ...r, qualityGate: await this.evaluateOption(r, evalCtx, blacklist) })),
          );
          retried = true;
          this.logger.log(`Gemini Lab quality-gate retry tenant=${params.tenantId}: all initial options failed, regenerated ${gated.length} option(s)`);
        }
      } catch (err) {
        this.logger.warn(`Quality-gate retry pass failed, keeping original options: ${(err as Error).message}`);
      }
    }

    const sourceCounts = new Map<string, number>();
    const options: LabOption[] = gated.map((g) => {
      const n = (sourceCounts.get(g.pack.source) || 0) + 1;
      sourceCounts.set(g.pack.source, n);
      return {
        id: `${g.pack.source}-${n}`,
        source: g.pack.source,
        label: `${g.pack.source === 'chatgpt' ? 'ChatGPT' : 'Gemini'} ${n}`,
        angle: g.pack.angle,
        caption: g.pack.caption,
        slides: g.slides,
        qualityGate: summarizeGate(g.qualityGate),
        design: {
          // Reported from the composition that RENDERED, not from the plan, so
          // a rejected composition shows what the user is actually looking at.
          format: g.pack.byIndex.get(0)?.format ?? g.pack.plan.format,
          photoMode: g.compositions[0]?.photoMode ?? g.pack.plan.photoMode,
          layout: g.pack.plan.layout,
          photoShape: g.compositions[0]?.photoShape ?? g.pack.plan.photoShape,
          decoration: g.pack.byIndex.get(0)?.decoration ?? g.pack.plan.decoration,
          paletteTreatment: treatmentFor(g.pack.plan.index).id,
          typePairing: pairingId(typography),
          templateId: g.pack.plan.templateId,
          renderPath: g.renderedBy?.get(g.pack.plan.index)?.path ?? 'composited',
          referenceId: g.renderedBy?.get(g.pack.plan.index)?.referenceId ?? null,
        },
      };
    });

    const first = options[0];
    const sources = [...new Set(options.map((o) => o.source))].join('+');
    const scores = options.map((o) => o.qualityGate.score);

    // Remember what actually rendered for the promoted option, so the next
    // generation for this brand can steer away from it. Recorded from the
    // resolved composition (which may be a preset fallback), not from what
    // the AI asked for — otherwise memory would track intent, not reality.
    const promotedComposition = gated[0]?.compositions?.[0];
    if (promotedComposition) {
      const promotedCopy = gated[0].pack.byIndex.get(plan[0]?.index ?? 0);
      await this.guidedDna.recordLook(
        params.tenantId,
        // Format is recorded too: repeating a KIND of post is what a viewer
        // reads as "automated", far more than a repeated grid position.
        // Falls back to the assigned plan rather than to null, so an option
        // whose copy omitted a field still leaves a complete fingerprint —
        // a half-empty signature is a look the avoid-list cannot steer from.
        signatureOf(
          promotedComposition,
          mood ?? null,
          promotedCopy?.decoration ?? gated[0].pack.plan.decoration,
          promotedCopy?.format ?? gated[0].pack.plan.format,
          paletteTreatment.id,
          pairingId(typography),
          gated[0].pack.plan.templateId,
        ),
      );
    }
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
        brand: guidedProfile?.identity.brandName || brandDna?.businessName || null,
        brandDna: !!brandDna,
        brandDnaSource: dnaSource,
        mood: guidedProfile?.identity.mood ?? null,
        templateSlug: template?.slug ?? null,
        templateName: template?.name ?? null,
        format: template?.format ?? null,
        slideCount: plan.length,
        optionCount: options.length,
        sources: options.map((o) => o.source),
        qualityGate: {
          evaluated: true,
          retried,
          allPassed: options.every((o) => o.qualityGate.passed),
          bestScore: scores.length ? Math.max(...scores) : null,
        },
        references: [
          photoA ? `PHOTO 1 · ${kindLabel(kindA)} (original pixels)` : null,
          photoB ? `PHOTO 2 · ${kindLabel(kindB)} (original pixels)` : null,
          logoBuf ? 'BRAND LOGO' : null,
          dnaSource === 'guided'
            ? `GUIDED BRAND DNA V2 (${MOOD_META[guidedProfile!.identity.mood].label})`
            : dnaSource === 'legacy'
              ? 'PRODUCTION BRAND DNA (legacy)'
              : 'BRAND DNA BYPASSED',
        ].filter(Boolean),
      },
    };
  }

  /**
   * Remembers the option the technician chose.
   *
   * Deliberately tolerant: the client posts back the design it was shown, and
   * a missing field just means that axis carries no preference. Nothing here
   * can fail a user action, so it never throws.
   */
  async recordSelection(tenantId: string, dto: GeminiLabSelectionDto): Promise<{ recorded: boolean }> {
    const mode = dto.photoMode;
    const photoMode: LabComposition['photoMode'] =
      mode === 'framed' || mode === 'full_bleed' || mode === 'dual_framed' || mode === 'typographic'
        ? mode
        : 'framed';
    await this.guidedDna.recordSelection(tenantId, {
      photoMode,
      // Cells are unknown from the client and are not what preference is read
      // from — format, decoration, palette and type are. Placeholders keep the
      // stored shape valid for parseRecentLooks.
      photoCell: 'CM',
      typeCell: 'CM',
      photoShape: dto.photoShape,
      mood: null,
      decoration: (dto.decoration as LabDecoration) ?? null,
      format: dto.format,
      paletteTreatment: dto.paletteTreatment,
      typePairing: dto.typePairing,
      chosen: true,
      at: new Date().toISOString(),
    });
    this.logger.log(
      `[selection] tenant=${tenantId} format=${dto.format ?? '?'} mode=${photoMode} palette=${dto.paletteTreatment ?? '?'} type=${dto.typePairing ?? '?'}`,
    );
    return { recorded: true };
  }

  /**
   * Edits a photograph from a written instruction.
   *
   * Guarded before any model is called: a before/after cannot be edited at
   * all, medical compliance blocks it outright, and an instruction that would
   * change the person rather than the picture is refused with the reason. See
   * photo-edit.ts for why each of those exists.
   */
  async editPhoto(params: {
    tenantId: string;
    file: Express.Multer.File | undefined;
    instruction: string;
    kind: string;
  }) {
    const apiKey = process.env['GEMINI_API_KEY'];
    if (!apiKey) throw new ServiceUnavailableException('GEMINI_API_KEY is not configured on this server');
    if (!params.file?.buffer) throw new BadRequestException('Attach the photo you want edited.');

    const guided = await this.guidedDna.getCompletedProfile(params.tenantId);
    const kind = normalizePhotoKind(params.kind);
    const allowed = canEditPhoto({
      kind,
      medicalCompliance: labComplianceBlocksClientPhotos(guided),
    });
    if (!allowed.ok) throw new BadRequestException(allowed.reason);

    const inScope = instructionIsInScope(params.instruction, kind);
    if (!inScope.ok) throw new BadRequestException(inScope.reason);

    const edited = await editPhoto({ apiKey, photo: params.file.buffer, instruction: params.instruction });
    if (!edited) {
      throw new BadRequestException('The edit came back empty. Try describing the change differently.');
    }
    // JPEG, not PNG. This is a photograph: PNG made the reply about ten times
    // larger for no visible gain, and the browser then had to fetch and decode
    // a multi-megabyte data: URL — slow enough on a real photo to look like the
    // edit had simply not happened.
    const jpeg = await sharp(edited).jpeg({ quality: 90 }).toBuffer();
    this.logger.log(
      `[photo-edit] tenant=${params.tenantId} kind=${params.kind} ` +
      `${(jpeg.length / 1024).toFixed(0)}KB — "${params.instruction.trim()}"`,
    );
    return {
      imageDataUrl: `data:image/jpeg;base64,${jpeg.toString('base64')}`,
      // Carried so the UI can label the photo and never call it original again.
      disclosure: editedDisclosure(params.instruction),
    };
  }

  /**
   * Keeps a post: stores the image and records what it was.
   *
   * This is what turns the Lab from a generator into a library. The selection
   * signal (recordSelection) teaches the plan builder; this stores the artefact
   * so the studio has a record of its own work and something to schedule.
   */
  async keepPost(tenantId: string, dto: GeminiLabKeepDto) {
    const png = dto.imageDataUrl ? dataUrlToPng(dto.imageDataUrl) : null;
    if (!png) throw new BadRequestException('Send the image you want to keep.');
    if (!storageAvailable()) {
      throw new ServiceUnavailableException('Image storage is not configured on this server.');
    }

    const imageUrl = await storePostImage({ tenantId, png });
    const post = await this.prisma.geminiLabPost.create({
      data: {
        tenantId,
        imageUrl,
        format: dto.format ?? 'statement',
        photoMode: dto.photoMode ?? 'framed',
        templateId: dto.templateId ?? null,
        paletteTreatment: dto.paletteTreatment ?? null,
        typePairing: dto.typePairing ?? null,
        aspectRatio: dto.aspectRatio ?? '4:5',
        headline: dto.headline ?? null,
        caption: (dto.caption ?? null) as any,
        scheduledFor: dto.scheduledFor ? new Date(dto.scheduledFor) : null,
        status: dto.scheduledFor ? 'scheduled' : 'kept',
      },
    });
    this.logger.log(`[library] kept tenant=${tenantId} format=${post.format} scheduled=${post.scheduledFor ? 'yes' : 'no'}`);
    return { id: post.id, imageUrl: post.imageUrl, status: post.status, scheduledFor: post.scheduledFor };
  }

  /** The studio's kept posts, newest first. Scheduled ones carry their date. */
  async listPosts(tenantId: string) {
    const posts = await this.prisma.geminiLabPost.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: [{ scheduledFor: 'asc' }, { createdAt: 'desc' }],
      take: 100,
    });
    return { posts };
  }

  /** Sets or clears the date a kept post is planned for. */
  async schedulePost(tenantId: string, id: string, scheduledFor: string | null) {
    const post = await this.prisma.geminiLabPost.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        status: scheduledFor ? 'scheduled' : 'kept',
      },
    });
    if (!post.count) throw new BadRequestException('That post is not in your library.');
    return { id, scheduledFor };
  }

  /**
   * Turns kept posts into a slideshow reel plan.
   *
   * This is the first connection between the Lab and the video pipeline, and
   * it closes the largest gap in the product: roughly half of what a beauty
   * account posts is video, and the Lab produced none. The pieces were already
   * on both sides and simply never met — kept posts carry a hosted image URL,
   * and buildSlideshowPlan is a pure function that turns image URLs into a
   * plan. The brand palette and heading face go in too, so the reel is set in
   * the same identity as the posts it is made from.
   *
   * Deliberately the plan only. Rendering runs through the video worker and
   * its queue, which is a different lifecycle with its own failure modes — the
   * caller decides whether to submit it.
   */
  async buildReelPlan(tenantId: string, postIds: string[]) {
    if (!postIds?.length) throw new BadRequestException('Pick the posts you want in the reel.');

    const posts = await this.prisma.geminiLabPost.findMany({
      where: { id: { in: postIds }, tenantId, deletedAt: null },
    });
    if (!posts.length) throw new BadRequestException('None of those posts are in your library.');

    // Ordered as the studio listed them, not as the database returned them —
    // a reel is a sequence and the order is the edit.
    const byId = new Map(posts.map((p) => [p.id, p]));
    const ordered = postIds.map((id) => byId.get(id)).filter((p): p is NonNullable<typeof p> => !!p);

    const guided = await this.guidedDna.getCompletedProfile(tenantId);
    const brandPalette = guided ? [...guided.identity.palette] : undefined;
    // The plan schema wants a UUID pointing at the brand record the reel was
    // built from, not a label. The guided row is the right reference; the
    // tenant stands in when a studio has not completed the wizard.
    const dnaRow = await this.prisma.geminiLabBrandDna
      .findUnique({ where: { tenantId }, select: { id: true } })
      .catch(() => null);

    const plan = buildSlideshowPlan({
      technicianId: tenantId,
      brandDnaRef: dnaRow?.id ?? tenantId,
      imageUrls: ordered.map((p) => p.imageUrl),
      objective: VIDEO_OBJECTIVE[guided?.strategy.objective ?? ''] ?? 'brand_awareness',
      headlines: ordered.map((p) => p.headline),
      captions: ordered.map((p) => {
        const c = p.caption as { hook?: string } | null;
        return c?.hook ?? null;
      }),
      brandFont: guided?.identity.typography.heading ?? null,
      brandPalette,
      medicalAesthetics: guided?.config.medicalAestheticsCompliance ?? false,
    });
    this.logger.log(`[reel] tenant=${tenantId} scenes=${ordered.length} duration=${plan.durationSeconds}s`);
    return { plan, postIds: ordered.map((p) => p.id) };
  }

  private async renderPack(
    pack: CopyPack,
    ctx: {
      plan: SlidePlan[];
      aspectRatio: string;
      palette: LabPalette;
      /** The palette treatment for a given option index — see paletteTreatments. */
      paletteFor: (index: number) => LabPalette;
      /** Where the person is in the hero photo, when the vision pass found one. */
      subject?: SubjectBox | null;
      /** Set when the AI-layout path is enabled; absent means compositor only. */
      aiLayoutKey?: string;
      /** The studio's own direction for this post, in their words. */
      extraNotes?: string;
      photoA?: Buffer;
      photoB?: Buffer;
      logoBuf?: Buffer;
      logoPosition: LogoPosition;
      typography: LabTypography;
      mood?: MoodHint;
      kindA: PhotoKind;
      kindB: PhotoKind | null;
      backgroundArt?: Buffer;
      frameVariantIndex?: number;
      /** The studio's own sale/price wording — the only source of truth for figures on a commercial post. */
      offerDetails?: string;
      /** Enables the render critique pass. Absent disables it entirely. */
      criticKey?: string;
      /** The layouts in force for this salon, so a tenant override resolves to its own geometry. */
      library?: PostTemplate[];
      /** Generate photo-free posts directly instead of compositing them. */
      generatePosters?: boolean;
      posterKey?: string;
      brandName?: string | null;
      essence?: string[];
      serviceAreas?: string[];
      testimonial?: string;
    },
  ): Promise<{
    slides: GeneratedSlide[];
    failures: string[];
    compositions: LabComposition[];
    /** How each option was rendered, so the reply can report it. */
    renderedBy: Map<number, { path: 'ai_layout' | 'composited' | 'poster'; referenceId: string | null }>;
  }> {
    const slides: GeneratedSlide[] = [];
    const failures: string[] = [];
    const compositions: LabComposition[] = [];
    // References already used in this run, so the options differ.
    const usedReferences: string[] = [];
    // How each option was rendered, so the reply can say so rather than
    // leaving it in the log.
    const renderedBy = new Map<number, { path: 'ai_layout' | 'composited' | 'poster'; referenceId: string | null }>();
    for (const slide of ctx.plan) {
      try {
        const copy = pack.byIndex.get(slide.index);
        const allowedContent = copy?.format ? contentForFormat(copy.format, copy.content) : undefined;
        // Every figure on a commercial post is checked against the studio's
        // own words before it can be drawn. A price the studio never quoted is
        // the one error that reaches a paying customer, so it is removed here
        // rather than trusted to the prompt that already asked for it.
        const audit = auditOfferContent({
          format: copy?.format,
          content: allowedContent,
          copy: [copy?.headline, copy?.subhead, copy?.cta, copy?.pill],
          offerDetails: ctx.offerDetails,
        });
        if (audit.removed.length) {
          this.logger.warn(
            `[offer] slide=${slide.index} pack=${pack.source} dropped unsupported claims — ${audit.removed.join('; ')}`,
          );
        }
        if (audit.copyIsUnsupported) {
          // Not renderable safely: the figure is inside the sentence. Fail the
          // slide so the option drops out and the existing regeneration pass
          // gets told exactly why.
          throw new Error(
            'on-image copy states a price, discount or date the studio did not supply',
          );
        }
        const formatContent =
          copy?.format && audit.content && contentSatisfiesFormat(copy.format, audit.content)
            ? audit.content
            : undefined;
        // The assigned plan is the fallback for every axis it owns, replacing
        // the old per-layout defaults. That single change is what stops a
        // rejected or omitted composition from landing on the same preset
        // every time: the fallback now varies per option by construction.
        const layout = sanitizeLayout(
          copy?.layout,
          // Rotates per slide, so a carousel whose later slides the model
          // never composed still varies instead of repeating one preset.
          slideLayout(pack.plan, slide.index, isBeforeAfterPair(ctx.kindA, ctx.kindB)),
          !!ctx.photoA && !!ctx.photoB,
        );
        const decoration = copy?.decoration && LAB_DECORATIONS.includes(copy.decoration)
          ? copy.decoration
          : pack.plan.decoration;
        const spec: LabSlideSpec = {
          layout,
          headline: cleanCopy(copy?.headline, 42) || fallbackHeadline(slide),
          subhead: cleanCopy(copy?.subhead, 72) || undefined,
          pill: reconcilePill(
            cleanCopy(copy?.pill, 22)?.toUpperCase() || fallbackPill(slide),
            photoForOption(slide.photo, pack.plan.photoMode, pack.plan.index, !!ctx.photoA, !!ctx.photoB),
          ),
          cta: cleanCopy(copy?.cta, 22) || undefined,
          photo: photoForOption(slide.photo, pack.plan.photoMode, pack.plan.index, !!ctx.photoA, !!ctx.photoB),
          leftPill: formatContent?.compareLabels?.left || pillLabel(ctx.kindA),
          rightPill: formatContent?.compareLabels?.right || pillLabel(ctx.kindB),
          decoration,
          // Two gates, and both are needed. contentForFormat drops anything
          // this format has no right to show — the route by which an invented
          // client quote reached a "meet the artist" post. contentSatisfiesFormat
          // then guards the opposite failure: a format that asked for steps
          // and sent none, which would render an empty region.
          content: formatContent,
        };
        // Geometry comes from the designed layout, not from the model. The
        // model's own composition is deliberately ignored: coordinate
        // invention is the one part of this job it was measurably bad at, and
        // every rejection of its geometry used to drop the post onto a preset.
        const template =
          ctx.library?.find((t) => t.id === pack.plan.templateId) ??
          TEMPLATES_BY_ID.get(pack.plan.templateId);
        const blockKinds = formatContent
          ? BLOCK_KINDS.filter((k) => hasContentFor(k, formatContent))
          : [];
        // No client photograph means nothing to protect, so the artwork is
        // GENERATED rather than composited — see poster-generate.ts. The
        // template geometry, the grid validation and the craft repairs all
        // exist to build a page around a real photo; with no photo they only
        // narrow what the model is allowed to make.
        if (ctx.generatePosters && ctx.posterKey && pack.plan.photoMode === 'typographic') {
          const png = await generatePoster({
            apiKey: ctx.posterKey,
            aspectRatio: ctx.aspectRatio,
            brand: {
              name: ctx.brandName,
              palette: ctx.paletteFor(pack.plan.index),
              typography: ctx.typography,
              mood: ctx.mood,
              essence: ctx.essence,
              serviceAreas: ctx.serviceAreas,
            },
            brief: {
              format: (copy?.format ?? pack.plan.format) as PostFormatId,
              headline: spec.headline,
              subhead: spec.subhead,
              badge: formatContent?.badge,
              cta: spec.cta,
              lines: [
                ...(formatContent?.rows ?? []).map((r) => `${r.label} — ${r.value}`),
                ...(formatContent?.steps ?? []).map((st, i) => `${i + 1}. ${st.label}${st.detail ? ` — ${st.detail}` : ''}`),
                ...(formatContent?.checklist ?? []).map((c) => `${c.positive ? 'Do' : "Don't"}: ${c.text}`),
                ...(formatContent?.quote?.text ? [`"${formatContent.quote.text}"${formatContent.quote.attribution ? ` — ${formatContent.quote.attribution}` : ''}`] : []),
              ],
              offerDetails: ctx.offerDetails,
              testimonial: ctx.testimonial,
              direction: ctx.extraNotes,
            },
          });
          if (png) {
            renderedBy.set(pack.plan.index, { path: 'poster', referenceId: null });
            this.logger.log(
              `[poster] slide=${slide.index} pack=${pack.source} option=${pack.plan.index + 1} format=${copy?.format ?? pack.plan.format} — generated directly`,
            );
            slides.push({
              index: slide.index,
              label: slide.label,
              imageDataUrl: `data:image/png;base64,${png.toString('base64')}`,
              notes: null,
            });
            continue;
          }
          this.logger.warn('[poster] direct generation returned nothing — composing instead');
        }

        // AI-designed page with the real photograph composited in.
        //
        // The compositor scores 40-56 with the design critic on photo posts,
        // and the critic's complaint is always the same: type placed without
        // knowing where the subject's face is. The image model composes far
        // better — but handing it the photograph and asking it not to change
        // the client is measurably useless (22-37% of the pixels came back
        // altered against a 0.2% noise floor; in one run the client was a
        // different person). So the model designs the page around a flat
        // placeholder and never sees the client, and we paste the real
        // photograph into the space it left.
        //
        // Opt-in while it is compared against the composited path, and every
        // failure falls through to that path rather than shipping a bad page.
        if (ctx.aiLayoutKey && ctx.photoA && pack.plan.photoMode !== 'typographic' && !ctx.photoB) {
          try {
            // One of the studio's own slides supplies the arrangement. Blurred
            // before it reaches the model, so only its structure carries over
            // and never its copy. Options avoid each other's references so the
            // four do not land on one layout.
            const reference = await pickReference({
              needsPhoto: true,
              avoid: usedReferences,
            });
            if (reference) usedReferences.push(reference.id);

            const laid = await renderWithAiLayout({
              apiKey: ctx.aiLayoutKey,
              photo: ctx.photoA,
              aspectRatio: ctx.aspectRatio,
              reference: reference ? fsReadRef(reference.file) : undefined,
              copy: {
                headline: spec.headline,
                subhead: spec.subhead,
                kicker: spec.pill,
                cta: spec.cta,
              },
              brand: {
                name: ctx.brandName,
                palette: ctx.paletteFor(pack.plan.index),
                typography: ctx.typography,
                mood: ctx.mood,
                essence: ctx.essence,
              },
            });
            if (laid.ok) {
              renderedBy.set(pack.plan.index, { path: 'ai_layout', referenceId: reference?.id ?? null });
              this.logger.log(
                `[ai-layout] slide=${slide.index} pack=${pack.source} option=${pack.plan.index + 1} ` +
                `ref=${reference?.id ?? 'none'} photo=${(laid.coverage * 100).toFixed(0)}% of canvas — designed by model, photo composited`,
              );
              slides.push({
                index: slide.index,
                label: slide.label,
                imageDataUrl: `data:image/png;base64,${laid.image.toString('base64')}`,
                notes: null,
              });
              continue;
            }
            this.logger.warn(`[ai-layout] ${laid.reason} — composing instead`);
          } catch (err: any) {
            this.logger.warn(`[ai-layout] failed (${err?.message ?? 'unknown'}) — composing instead`);
          }
        }

        const composition = template
          ? compositionFromTemplate(template, {
              photoShape: pack.plan.photoShape,
              blockKinds,
            })
          : applyPlanToComposition(copy?.composition, pack.plan);
        // `rejected` reports whether the composition passed validation or was
        // replaced by a preset. The critic pass needs to know: a revision that
        // gets rejected renders a PRESET, which is a worse post than the
        // authored one it was meant to improve, and without this flag that
        // silently replaced a good design with a generic one.
        const renderWith = (comp: typeof composition, rejected?: { value: boolean }) => renderLabSlide({
          spec,
          aspectRatio: ctx.aspectRatio,
          palette: ctx.paletteFor(pack.plan.index),
          before: ctx.photoA,
          after: ctx.photoB,
          logo: ctx.logoBuf,
          logoPosition: ctx.logoPosition,
          typography: ctx.typography,
          mood: ctx.mood,
          subject: ctx.subject,
          backgroundArt: ctx.backgroundArt,
          frameVariantIndex: ctx.frameVariantIndex,
          designSpec: copy?.designSpec,
          composition: comp,
          // Logged at LOG level, not debug: this is the signal that answers
          // "why does every post look the same", so it must be visible in
          // normal operation rather than behind a log level that is off.
          onCompositionFallback: (reason) => {
            if (rejected) rejected.value = true;
            this.logger.log(`[composition] REJECTED slide=${slide.index} pack=${pack.source} — ${reason}`);
          },
          onCompositionResolved: (resolved) => {
            compositions.push(resolved);
            const cell = (r: { x: number; y: number; w: number; h: number }) => {
              const cx = r.x + r.w / 2;
              const cy = r.y + r.h / 2;
              return `${cx < 1 / 3 ? 'L' : cx < 2 / 3 ? 'C' : 'R'}${cy < 1 / 3 ? 'T' : cy < 2 / 3 ? 'M' : 'B'}`;
            };
            this.logger.log(
              `[composition] slide=${slide.index} pack=${pack.source} option=${pack.plan.index + 1} template=${pack.plan.templateId} ` +
              `format=${copy?.format ?? pack.plan.format} blocks=${resolved.blocks?.map((b) => b.kind).join('+') || 'none'} ` +
              `layout=${layout} mode=${resolved.photoMode} photo@${cell(resolved.photoBox)} type@${cell(resolved.typeBox)}`,
            );
          },
        });

        let png = await renderWith(composition);

        // Agentic pass: look at what actually rendered and fix the biggest
        // problem with it. The old gate could only answer yes/no, so a bad
        // composition was regenerated blind rather than corrected — this
        // critiques the pixels and returns edits against the same grid the
        // composition was authored on. One revision only: a second pass
        // measurably chases its own tail, and the render is already the
        // expensive part.
        if (ctx.criticKey && slide.index === 0) {
          const critique = await critiqueRender({
            apiKey: ctx.criticKey,
            png,
            brief: `A ${copy?.format ?? pack.plan.format} post. Headline: "${spec.headline}". ${
              pack.plan.photoMode === 'typographic'
                ? 'It is a designed poster with no photograph.'
                : `The photograph is placed ${pack.plan.photoMode}.`
            }`,
          });
          if (critique) {
            this.logger.log(
              `[critic] slide=${slide.index} pack=${pack.source} option=${pack.plan.index + 1} score=${critique.score}` +
              `${critique.issues.length ? ` — ${critique.issues.join('; ')}` : ''}` +
              `${critique.revision ? ' — revising' : ''}`,
            );
            if (critique.revision) {
              const revised = applyRevision(composition, critique.revision);
              const rejected = { value: false };
              try {
                const revisedPng = await renderWith(revised, rejected);
                if (rejected.value) {
                  // Observed live: the critic widened a text region so that a
                  // steps block then overlapped it, the whole composition was
                  // rejected, and the post fell back to a preset. Keeping the
                  // original is strictly better than accepting that trade.
                  this.logger.log('[critic] revision was rejected by the composition rules — keeping the original');
                } else {
                  png = revisedPng;
                }
              } catch (err) {
                this.logger.warn(`[critic] revision failed to render, keeping the original: ${(err as Error).message}`);
              }
            }
          }
        }

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
    return { slides, failures, compositions, renderedBy };
  }

  /** Judges an option's primary (first) slide via the shared ScoringGateService — same rubric the old orchestrator pipeline uses. */
  private async evaluateOption(
    r: { pack: CopyPack; slides: GeneratedSlide[] },
    ctx: { photoA?: Buffer; photoB?: Buffer; isPair: boolean; plan: SlidePlan[]; tenantId: string },
    blacklist: string[],
  ): Promise<ScoringResult> {
    const primary = ctx.plan[0];
    const originalPhotoBuffer = primary?.photo === 'before' ? ctx.photoA : primary?.photo === 'after' ? ctx.photoB : ctx.photoA ?? ctx.photoB;
    return this.scoringGate.evaluate({
      caption: formatCaptionForGate(r.pack.caption),
      hashtags: r.pack.caption.hashtags,
      blacklist,
      hasBefore: ctx.isPair,
      // The medical-compliance guard earlier in generate() already throws
      // before this point if before/after client photos aren't allowed —
      // this is a safe pass-through, not a new gate.
      beforeAfterAllowed: true,
      isCarousel: ctx.plan.length > 1,
      slidesCount: ctx.plan.length,
      generatedBy: r.pack.source === 'chatgpt' ? 'ChatGPT' : 'Gemini',
      tenantId: ctx.tenantId,
      prisma: this.prisma,
      originalPhotoBuffer,
      generatedPhotoBuffer: dataUrlToBuffer(r.slides[0].imageDataUrl),
    });
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

    const zones = Array.isArray(template?.zones) ? (template!.zones as Array<{ label?: string; type?: string }>) : [];
    const hasZones = count > 1 && zones.length >= count;
    const labels = count <= 1
      ? [template?.name || 'Post']
      : hasZones
        ? zones.slice(0, count).map((z, i) => z.label || `Slide ${i + 1}`)
        : Array.from({ length: count }, (_, i) => defaultCarouselLabel(i, count, ctx.isPair));
    const zoneTypes: Array<ZoneType | null> = count <= 1
      ? [null]
      : hasZones
        ? zones.slice(0, count).map((z) => (isZoneType(z.type) ? z.type : null))
        : labels.map(() => null);

    return labels.map((label, i) => {
      const zoneType = zoneTypes[i];
      return {
        index: i,
        label: count > 1 ? `${String(i + 1).padStart(2, '0')} · ${label}` : label,
        layout: layoutFor(label, i, count, ctx.hasA, ctx.hasB, ctx.isPair, zoneType),
        photo: photoFor(label, i, count, ctx.hasA, ctx.hasB, ctx.isPair),
        zoneType,
      };
    });
  }

  /**
   * Rewrites any line that reads as beauty-industry filler.
   *
   * Runs once per option, and only when the detector actually finds something,
   * so a clean run costs nothing. The rewrite is given ONLY the failing lines
   * and cannot introduce a price, a date or a client quote — those are the
   * facts the post is built on and they are settled before this point.
   */
  private async deClicheCopy(packs: CopyPack[], apiKey: string, model: string): Promise<void> {
    await Promise.all(
      packs.map(async (pack) => {
        for (const [index, copy] of pack.byIndex) {
          const fields = {
            headline: copy.headline,
            subhead: copy.subhead,
            cta: copy.cta,
          };
          const problems = auditCopy(fields);
          if (!problems.length) continue;

          try {
            const prompt = buildRepairPrompt({ copy: fields, problems });
            const res = await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }] }),
              },
            );
            const json = (await res.json()) as any;
            const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
            const repaired = applyRepair(fields, String(text));

            if (repaired.headline && repaired.headline !== copy.headline) copy.headline = repaired.headline;
            if (repaired.subhead && repaired.subhead !== copy.subhead) copy.subhead = repaired.subhead;
            if (repaired.cta && repaired.cta !== copy.cta) copy.cta = repaired.cta;

            this.logger.log(
              `[cliche] pack=${pack.source} slide=${index} removed ${problems.flatMap((p) => p.found).join(', ')}`,
            );
          } catch (err) {
            // A failed repair leaves the original wording, which is a weaker
            // post but still a post.
            this.logger.warn(`[cliche] repair failed: ${(err as Error).message}`);
          }
        }
      }),
    );
  }

  private async writeCopyOptions(params: {
    geminiKey: string;
    geminiModel: string;
    openaiKey?: string;
    brandDna: any | null;
    guidedProfile: GuidedDnaProfile | null;
    template: { name: string; slug: string; format: string; description: string | null } | null;
    overlayText?: string;
    extraNotes?: string;
    plan: SlidePlan[];
    photoA?: Buffer;
    photoB?: Buffer;
    kindA: PhotoKind;
    kindB: PhotoKind | null;
    templateRefBuffer?: Buffer;
    retryFeedback?: string;
    recentLooks?: LookSignature[];
    /** Tenant locale — drives country, hemisphere, season and which celebrations are relevant. */
    locale?: string | null;
    /** Tenant timezone. Takes precedence over locale: it is the field that is actually populated per tenant. */
    timezone?: string | null;
    /** True when the caller supplied real prices/quotes/openings. Formats that assert facts stay off otherwise. */
    hasFacts?: boolean;
    /** No photo was uploaded — a generated studio still life will carry the post instead. */
    hasGeneratedImagery?: boolean;
    /** Format explicitly chosen by the technician in the Lab UI. */
    requestedFormat?: string;
    /** Real sale/price/availability facts in the technician's own words. */
    offerDetails?: string;
    /** A real client review, verbatim. */
    testimonial?: string;
    /** This studio's prompt edits, resolved against the shipped defaults per block. */
    promptOverrides?: PromptOverrides;
    /** The layouts this salon may be composed in. */
    library?: PostTemplate[];
    /** A layout read from this run's style reference — what the technician actually pointed at. */
    referenceLayoutId?: string | null;
  }): Promise<CopyPack[]> {
    const thumbA = params.photoA ? await thumbJpeg(params.photoA) : null;
    const thumbB = params.photoB ? await thumbJpeg(params.photoB) : null;
    const thumbRef = params.templateRefBuffer ? await thumbJpeg(params.templateRefBuffer) : null;
    // Without this the model picks a photo region blind to the photo's own
    // shape — a portrait shot dropped into a wide region gets cropped to
    // pieces. Telling it the real aspect lets it choose a region that fits.
    const photoAspect = params.photoA ? await describeAspect(params.photoA) : null;
    const photoCount = (params.photoA ? 1 : 0) + (params.photoB ? 1 : 0);
    const formats = availableFormats({
      photoCount,
      hasFacts: params.hasFacts,
      ownMessage: params.overlayText,
      hasGeneratedImagery: params.hasGeneratedImagery,
      hasOfferDetails: !!params.offerDetails?.trim(),
      hasTestimonial: !!params.testimonial?.trim(),
    });
    const market = marketContext(params.locale, params.timezone);

    // Every design axis the model was measured not to vary is decided here,
    // once, for every option across every provider — see creative-plan.ts.
    // Previously only `format` was assigned, and both providers received the
    // SAME two assignments, so Gemini's option 1 and ChatGPT's option 1 were
    // the same kind of post; everything else (layout, photoMode, shape,
    // decoration) was requested in prose and came back identical.
    const providers: Array<'gemini' | 'chatgpt'> = params.openaiKey ? ['gemini', 'chatgpt'] : ['gemini'];
    const plans = buildOptionPlans(providers.length * OPTIONS_PER_PROVIDER, {
      formats,
      requestedFormat: params.requestedFormat,
      isPair: isBeforeAfterPair(params.kindA, params.kindB),
      hasPhoto: !!params.photoA || !!params.photoB,
      recentLooks: params.recentLooks ?? [],
      library: params.library,
      referenceLayoutId: params.referenceLayoutId,
      // A format that carries steps or prices needs a layout with somewhere
      // to put them.
      needsBlock: (format) => POST_FORMATS[format].blocks.some((b) => b !== 'badge'),
    });
    const plansFor = (i: number) => plans.slice(i * OPTIONS_PER_PROVIDER, (i + 1) * OPTIONS_PER_PROVIDER);
    this.logger.log(
      `[plan] ${plans.map((p) => `${p.format}/${p.photoMode}/${p.templateId}/${p.photoShape}`).join('  ')}`,
    );

    const jobs = providers.map((provider, i) => {
      // A prompt per provider, carrying only that provider's assignments, so
      // the four options are four different productions rather than two.
      const prompt = buildCopyPrompt({
        ...params,
        hasTemplateRef: !!thumbRef,
        photoAspect,
        formats,
        market,
        optionPlans: plansFor(i),
        blocks: resolveAllBlocks(params.promptOverrides),
      });
      return provider === 'gemini'
        ? this.copyFromGemini(params.geminiKey, params.geminiModel, prompt, thumbA, thumbB, thumbRef, params.kindA, params.kindB)
        : this.copyFromChatGpt(params.openaiKey!, prompt, thumbA, thumbB, thumbRef, params.kindA, params.kindB);
    });

    const settled = await Promise.allSettled(jobs);
    const packs: CopyPack[] = [];
    const seen = new Set<string>();
    settled.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.warn(`Copy provider ${providers[i]} failed: ${result.reason?.message || result.reason}`);
        return;
      }
      const mine = plansFor(i);
      result.value.forEach((pack, row) => {
        const key = [...pack.byIndex.values()].map((s) => s.headline.toLowerCase()).join('|');
        if (seen.has(key)) return;
        seen.add(key);
        // Pair the returned option with the assignment it was written from.
        // Order is the only link available (the model has no stable id to
        // echo), and it is the order it was asked to write them in.
        packs.push({ ...pack, plan: mine[row] ?? mine[mine.length - 1] ?? plans[0] });
      });
    });
    if (!packs.length) {
      packs.push({
        source: 'gemini',
        angle: 'Studio look',
        byIndex: new Map(),
        caption: { hook: '', body: '', cta: '', hashtags: [] },
        plan: plans[0],
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
    thumbRef: string | null,
    kindA: PhotoKind,
    kindB: PhotoKind | null,
  ): Promise<UnplannedPack[]> {
    const vision: Array<Record<string, unknown>> = [];
    if (thumbA) {
      vision.push({ text: `[PHOTO 1 — ${kindLabel(kindA).toUpperCase()}]` });
      vision.push({ inlineData: { mimeType: 'image/jpeg', data: thumbA } });
    }
    if (thumbB) {
      vision.push({ text: `[PHOTO 2 — ${kindLabel(kindB).toUpperCase()}]` });
      vision.push({ inlineData: { mimeType: 'image/jpeg', data: thumbB } });
    }
    if (thumbRef) {
      vision.push({ text: `[STYLE REFERENCE — a design the technician likes. Match its layout/mood/decoration energy. Never composite this image or its content — it is inspiration only, not a photo for this post.]` });
      vision.push({ inlineData: { mimeType: 'image/jpeg', data: thumbRef } });
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
    thumbRef: string | null,
    kindA: PhotoKind,
    kindB: PhotoKind | null,
  ): Promise<UnplannedPack[]> {
    const content: Array<Record<string, unknown>> = [{ type: 'text', text: prompt }];
    if (thumbA) {
      content.push({ type: 'text', text: `PHOTO 1 — ${kindLabel(kindA)}` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbA}` } });
    }
    if (thumbB) {
      content.push({ type: 'text', text: `PHOTO 2 — ${kindLabel(kindB)}` });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbB}` } });
    }
    if (thumbRef) {
      content.push({ type: 'text', text: 'STYLE REFERENCE — a design the technician likes. Match its layout/mood/decoration energy. Never composite this image or its content — it is inspiration only, not a photo for this post.' });
      content.push({ type: 'image_url', image_url: { url: `data:image/jpeg;base64,${thumbRef}` } });
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

// Explains what each numeric design-brief field actually does visually, so
// the model can author real values instead of picking from a fixed preset
// table — every value gets clamped server-side afterward (clampDesignSpec),
// so there's no risk from an extreme number, only a missed creative choice.
const DESIGN_BRIEF_TEXT = [
  '  - matPad (0-32): paper-mat border padding around the photo. 0 = flush-mounted, no mat (editorial/clinical). 14-22 = classic gallery paper mat (soft/warm). 24-32 = generous mat (organic/playful, gift-like).',
  '  - borderWidth (0-8) + borderOpacity (0-1): a hard-edge rule around the photo INSTEAD of a mat (set matPad near 0 when using this). 0 = none. 1-2 = hairline (minimal/clinical). 4-8 = bold graphic border in the accent colour (luxe/bold).',
  '  - shadowOpacity (0-0.5) + shadowBlur (2-16): how much the photo lifts off the background. Low+soft (0.1/8) = quiet/flush. High+tight (0.4/4) = dramatic, graphic, hard-edged luxe shadow.',
  '  - radius (0-36): photo/mat corner rounding. 0 = sharp corners (editorial/clinical/luxe). 18-36 = soft rounded corners (organic/playful).',
  '  - headingWeight (300-800) + tracking (-2 to 3): headline font weight and letter-spacing. Light+wide (400/1.5) reads editorial/refined. Heavy+tight (700/-1) reads bold/confident. Match the mood, don\'t just default to the middle.',
  '  - decorationIntensity (0-1): how visible the chosen decoration motif is. 0 = invisible even if a decoration id is set (use this to effectively turn it off). 1 = fully visible.',
].join('\n');

/**
 * Spelling the studio's own market actually uses.
 *
 * `languageVariant` was captured by the wizard and then never read, so a UK
 * salon that told us it writes UK English got US spelling on every post. That
 * is not a subtle miss — "colour" is the word a British client expects to see
 * from their own hairdresser.
 */
const SPELLING: Record<string, string> = {
  UK: 'British English spelling and idiom — colour, centre, specialise, jewellery. Never American spellings.',
  AU: 'Australian English spelling and idiom — colour, centre, specialise, jewellery. Never American spellings.',
  US: 'American English spelling and idiom — color, center, specialize, jewelry.',
};

/**
 * How the caption should be written for where it is going.
 *
 * `platforms` was captured and discarded too, which meant a studio that only
 * posts to TikTok got an Instagram caption. The platforms differ in the one
 * thing a caption is: length, tone and how hashtags behave.
 */
function platformBrief(platforms: { instagram: boolean; facebook: boolean; tiktok: boolean }): string {
  const on = [
    platforms.instagram && 'Instagram',
    platforms.tiktok && 'TikTok',
    platforms.facebook && 'Facebook',
  ].filter(Boolean) as string[];
  if (!on.length) return '';

  // Written for the strictest surface in play, so one caption works everywhere
  // it is going rather than being right for one and wrong for the others.
  if (platforms.tiktok && !platforms.instagram) {
    return `This is going to TikTok. Keep the caption to one or two short lines — the video carries the message — and use 3-4 hashtags at most.`;
  }
  if (platforms.facebook && !platforms.instagram && !platforms.tiktok) {
    return `This is going to Facebook. Write in full sentences, a little warmer and longer than an Instagram caption, and use no more than 2 hashtags — they do almost nothing there.`;
  }
  return `This is going to ${on.join(' and ')}. Write for Instagram first: the hook has to work as the single visible line before "more".`;
}

function guidedBrief(profile: GuidedDnaProfile): string[] {
  const meta = MOOD_META[profile.identity.mood];
  const aud = profile.audience;
  const strat = profile.strategy;
  // genderFocus was collected in the wizard and then dropped on the floor.
  // Who the studio is speaking to changes the second person of every line.
  const GENDER_LINE: Record<string, string> = {
    WOMEN: 'speaking to women',
    MEN: 'speaking to men',
    ALL: 'speaking to all genders — keep the address inclusive',
  };
  const genderNote = GENDER_LINE[aud.genderFocus] ? `, ${GENDER_LINE[aud.genderFocus]}` : '';
  const clientLine = aud.clientTypes.length
    ? `ideal client: ${aud.clientTypes.join(', ')}, aged ${aud.ageMin}-${aud.ageMax}${genderNote}`
    : `ideal client: aged ${aud.ageMin}-${aud.ageMax}${genderNote}`;
  return [
    `BRAND MOOD — write, style, and choose layout/decoration as if you ARE this: ${meta.label} (${meta.blurb})`,
    profile.identity.essence.length ? `Essence this brand must FEEL like, in every line: ${profile.identity.essence.join(', ')}.` : '',
    `Business: ${profile.identity.brandName || 'this studio'}. Category: ${profile.offering.serviceCategory || 'beauty'}.`,
    // The writer was never told what its words would be set in. A high-contrast
    // display face at poster scale carries three or four words; a humanist sans
    // carries a sentence. Writing blind to that is how headlines arrive needing
    // to be shrunk to fit.
    `Your headline will be set in ${profile.identity.typography.heading} and the body in ${profile.identity.typography.body}. Write lines that suit those faces at large size — short and declarative for a display serif, a little more room for a sans.`,
    profile.offering.services.length ? `Services in frame: ${profile.offering.services.join(', ')}.` : '',
    profile.offering.signatureHandle ? `Signature: ${profile.offering.signatureHandle}.` : '',
    clientLine,
    `Content objective: ${OBJECTIVE_LABEL[strat.objective] || strat.objective}. Write toward this outcome, don't just describe the photo.`,
    profile.story.userWritten || profile.story.aiDrafted
      ? `Brand story to echo (don't quote verbatim): ${profile.story.userWritten || profile.story.aiDrafted}`
      : '',
    profile.config.medicalAestheticsCompliance ? `COMPLIANCE ON: educational framing only, no treatment outcomes, no medical claims.` : '',
    SPELLING[profile.config.languageVariant] ? `Write in ${SPELLING[profile.config.languageVariant]}` : '',
    platformBrief(profile.config.platforms),
    // Local relevance is the strongest hook a salon has, and this was captured
    // and then thrown away like the other two.
    profile.offering.serviceAreas.length
      ? `This studio serves ${profile.offering.serviceAreas.join(', ')}. Where it fits naturally, ground the copy and the hashtags in that place — never invent a suburb it did not name.`
      : '',
  ].filter(Boolean);
}

const OBJECTIVE_LABEL: Record<string, string> = {
  PREMIUM_CLIENTS: 'attract premium clients — fewer, higher-value bookings',
  FILL_QUIET_DAYS: 'fill quiet days — midweek/off-peak demand',
  EDUCATE_TRUST: 'educate and build trust — authority without hard sell',
  PROMOTE_BRIDAL: 'promote bridal — weddings/events pipeline',
  LAUNCH_PRODUCT: 'launch a product — retail or treatment drop',
};

export function buildCopyPrompt(params: {
  brandDna: any | null;
  guidedProfile: GuidedDnaProfile | null;
  template: { name: string; slug: string; format: string; description: string | null } | null;
  overlayText?: string;
  extraNotes?: string;
  plan: SlidePlan[];
  kindA: PhotoKind;
  kindB: PhotoKind | null;
  retryFeedback?: string;
  hasTemplateRef?: boolean;
  recentLooks?: LookSignature[];
  photoAspect?: string | null;
  /** Formats this generation may choose from — already filtered by photo count and available facts. */
  formats?: PostFormat[];
  /** No client photo — the image will be a generated studio still life, so the copy must not describe a person. */
  hasGeneratedImagery?: boolean;
  /** Country, hemisphere, season and nearby celebrations, from the tenant's locale. */
  market?: MarketContext;
  /**
   * Server-assigned design plan per option. Format was already assigned here
   * because the model would not vary it; layout, photoMode, photoShape and
   * decoration are assigned for exactly the same measured reason. See
   * creative-plan.ts.
   */
  optionPlans?: OptionPlan[];
  /** Real sale/price/availability facts supplied by the technician. */
  offerDetails?: string;
  /** A real client review, verbatim. */
  testimonial?: string;
  /** Per-tenant prompt overrides, already resolved against the shipped defaults. */
  blocks?: Record<PromptBlockId, string>;
}): string {
  const blocks = params.blocks ?? resolveAllBlocks(undefined);
  const dna = params.brandDna;
  const guided = params.guidedProfile;
  const revisionBlock = params.retryFeedback
    ? [
        `⚠ REVISION REQUIRED — a quality reviewer rejected your previous attempt for this exact brief:`,
        params.retryFeedback,
        `Fix these specific issues in this new attempt. Do not repeat them. Everything below still applies.`,
      ]
    : [];
  const brandLock = guided
    ? [
        `BRAND DNA IS LAW — write as this studio, not a generic salon:`,
        ...guidedBrief(guided),
        `- Never mention a logo, wordmark, or colour hex.`,
        `- Never invent a different salon name, tagline, or offer.`,
      ]
    : dna
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
  // A run whose options are all posters has no photograph and no compositor.
  // Every instruction below that assumes one is not merely redundant, it is a
  // contradiction the writer has to resolve - and the ones about fitting a
  // fixed space are what made this copy timid.
  const postersOnly =
    !!params.optionPlans?.length && params.optionPlans.every((pl) => pl.photoMode === 'typographic');
  const recentLookLines = describeRecentLooks(params.recentLooks ?? []);
  // `defaultLayout` is deliberately absent: layout is assigned per option now
  // (see creative-plan.ts), so showing a per-slide default alongside the
  // assignment would be two answers to the same question.
  const slidesJson = params.plan.map((s) => ({
    index: s.index,
    label: s.label,
    zonePurpose: s.zoneType,
  }));
  return [
    blocks.role,
    ...revisionBlock,
    postersOnly
      ? `THERE IS NO PHOTOGRAPH in this run. Every option is artwork designed from your words, so the words carry it. Write lines that deserve to be set large.`
      : params.hasGeneratedImagery
      ? `THERE IS NO CLIENT PHOTO for this post. The image will be a generated studio still life — tools, products, textiles, a corner of the room. Never write copy that describes a client, a face, a result on a person, or a transformation, because nothing of the kind is in the picture. Write about the craft, the knowledge, the offer or the occasion instead.`
      : blocks.photo_reading,
    // The format choice is the single biggest lever on perceived variety. A
    // moved headline reads as the same post; a price card next to a technique
    // walkthrough reads as a real feed. This block is why that is now possible.
    ...(params.formats?.length
      ? [
          postersOnly
            ? `EACH OPTION IS A DIFFERENT KIND OF POST. A studio's feed is not twelve versions of the same thing — it is proof, teaching, prices, celebration. Which kind each option is has been chosen for you; everything else is yours:${String.fromCharCode(10)}${(params.optionPlans ?? []).map((plan) => describePlan(plan, params.formats!)).join(String.fromCharCode(10))}`
            : `EACH OPTION'S DESIGN IS ASSIGNED. A studio's feed is not twelve versions of "photo with a headline" — it is proof, teaching, prices, celebration, and the person behind the chair, each shot differently. Which of those each option is, and how it is framed, has already been decided:\n${(params.optionPlans ?? []).map((plan) => describePlan(plan, params.formats!)).join('\n')}`,
          `Set "format" on each slide, and put that format's content in a "content" object. Only include the fields your chosen format needs:\n` +
            `  - steps: [{"label":"Map the shape","detail":"optional one-liner"}] — 2-4 items, for 'process'\n` +
            `  - rows: [{"label":"Full set","value":"$120"}] — 2-5 items, for 'menu'/'offer'/'availability'\n` +
            `  - checklist: [{"text":"Brush daily","positive":true}] — 2-5 items, for 'tips'/'myth' (positive:false renders a cross)\n` +
            `  - quote: {"text":"…","attribution":"Sarah M."} — for 'testimonial'\n` +
            `  - badge: "20% OFF" — a short chip, max 18 chars\n` +
            `  - compareLabels: {"left":"Before","right":"After"} — for 'proof'\n` +
            postersOnly ? '' : `The layout already has a place for that content — you supply what it says, not where it goes.`,
          // Measured: the model repeatedly gave the headline a 4-column region,
    // which forces a 3-6 word headline to wrap to four cramped lines.
    postersOnly ? '' : `The layout fixes how much room the headline has, so write to fit it: a headline that has to wrap to four cramped lines is too long, not too big.`,
          params.testimonial?.trim()
      ? `THE STUDIO SUPPLIED A REAL CLIENT REVIEW. If you use the testimonial format, quote it VERBATIM — you may trim it to fit, but never reword, polish, embellish or extend it, and never invent an attribution that was not given:
<<<${params.testimonial.trim()}>>>`
      : '',
    params.offerDetails?.trim()
      ? `THE STUDIO SUPPLIED THESE REAL OFFER DETAILS. Use them exactly; never contradict, round, or improve on them:
<<<${params.offerDetails.trim()}>>>
Every price, percentage, date and deadline on the post must come from that text. If it does not state a figure, do not put one on the post. Do not add urgency the studio did not claim.
THIS IS VERIFIED AUTOMATICALLY. Every number, percentage and month you write on the image is checked against the text above before the post is rendered: a price row or badge citing anything else is deleted, and a headline or subhead citing anything else fails the whole option. Do not round a price, convert a currency, extend a deadline, add a "was" price, invent a saving in dollars from a percentage, or infer a figure you were not given. Copy the studio's figures exactly, or write copy that carries no figure at all.`
      : `Never invent a price, a client quote, an opening time or a discount. If you were not given the real figure, choose a format that doesn't need one.`,
        ]
      : []),
    params.market ? describeMarket(params.market) : '',
    // The composition brief is gone. Geometry is a designed layout now
    // (templates.ts), which is why this prompt no longer asks a language
    // model for grid coordinates — the job it was measurably worst at, and
    // the source of every dead-space / narrow-column / no-anchor critique.
    postersOnly ? '' : blocks.composition_craft,
    params.photoAspect
      ? `THE PHOTO IS ${params.photoAspect.toUpperCase()}. It is cropped to fill the space the layout gives it, so write copy about what will still be in frame.`
      : '',
    ...(recentLookLines.length
      ? [
          `THIS BRAND HAS ALREADY BEEN SERVED THESE LOOKS (most recent first) — your composition must be visibly different from them, not a small variation:\n${recentLookLines.map((l) => `  - ${l}`).join('\n')}`,
          `MIRRORING DOES NOT COUNT AS DIFFERENT. Swapping a remembered arrangement left-to-right (photo left/type right vs photo right/type left) reads as the exact same template to a viewer scrolling a feed. To be genuinely different, change the STRUCTURE: switch between framed and full_bleed, move the type over the photo, stack vertically instead of side by side, or move the type to the top instead of the middle/bottom.`,
        ]
      : []),
    // Mat padding, border width, shadow and corner radius describe the
    // compositor's frame around a photograph. A generated poster has no
    // frame, so on a poster-only run these are noise in the brief.
    (params.optionPlans ?? []).every((pl) => pl.photoMode === 'typographic')
      ? ''
      : `Beyond the assigned layout and decoration, author the actual STYLE for each slide yourself — don't default to one safe look. Include a "design" object per slide with these fields, informed by the brand mood/essence, this specific photo, and (if attached) the style reference:\n${DESIGN_BRIEF_TEXT}`,
    postersOnly ? '' : `Each slide below carries a "zonePurpose" when a template is active — 'cta' = booking beat, 'quote'/'text' = the photo should recede rather than dominate, 'photo' = the photo is the point. Compose that slide accordingly.`,
    params.hasTemplateRef
      ? `A STYLE REFERENCE image is attached (separate from the client photo) — the technician uploaded it to show the kind of layout/mood/decoration/design they want. Let it genuinely steer your layout, decoration, AND design-object choices for every slide. It is never composited and never described in the copy.`
      : '',
    `Return JSON only:`,
    postersOnly
      ? `{"options":[{"angle":"","slides":[{"index":0,"format":"offer","headline":"","subhead":"","pill":"","cta":"","content":{"rows":[{"label":"","value":""}]}}],"caption":{"hook":"","body":"","cta":"","hashtags":[]}}]}`
      : `{"options":[{"angle":"","slides":[{"index":0,"format":"process","headline":"","subhead":"","pill":"","cta":"","content":{"steps":[{"label":"","detail":""}]},"decoration":"none","design":{"matPad":14,"borderWidth":0,"borderOpacity":0,"shadowOpacity":0.28,"shadowBlur":7,"radius":8,"headingWeight":500,"tracking":-0.6,"decorationIntensity":1}}],"caption":{"hook":"","body":"","cta":"","hashtags":[]}}]}`,
    // What is genuinely still the model's to vary. The axes it would NOT vary
    // (format, layout, photoMode, photoShape, decoration) are assigned above
    // and enforced at render time, so there is nothing left to plead for.
    `Write ${params.optionPlans?.length ?? OPTIONS_PER_PROVIDER} options, one per assignment above, in that exact order, echoing each assignment's values back verbatim. Give each a different angle — craft/process for one, desire/feeling for the other.${postersOnly ? '' : ' Design each composition for its own assigned photoMode rather than reusing the same regions twice.'}`,
    `ON-IMAGE copy:`,
    blocks.copy_rules,
    `CAPTION (the post people read under the image):`,
    blocks.caption_rules,
    params.kindA === 'before' && params.kindB === 'after'
      ? `Photos are a before/after pair. Transformation language is allowed.`
      : postersOnly ? '' : `Do not assume before/after. Photo 1 is ${kindLabel(params.kindA)}${params.kindB ? `; photo 2 is ${kindLabel(params.kindB)}` : ''}.`,
    ...brandLock,
    // The studio's own idea for THIS post. It used to be appended near the end
    // as "Notes: ..." — the weakest position in the prompt and framed as an
    // aside, so a technician who typed what they actually wanted got a post
    // that mostly ignored it. It now sits directly under the brand, stated as
    // the brief, and is explicitly to be INTERPRETED through the brand rather
    // than copied out: the studio supplies the idea, the brand supplies the
    // voice and the look.
    params.extraNotes
      ? `THE STUDIO'S OWN IDEA FOR THIS POST — this is the brief, honour it:
<<<${params.extraNotes.trim()}>>>
Realise that idea in this brand's voice, mood and aesthetic. Do not quote it back word for word unless it is already a finished line, and do not let it override a guardrail — but every option should be recognisably about it.`
      : '',
    `- No medical claims. No invented results or prices.`,
    params.template ? `Template: ${params.template.name} — ${params.template.description || ''}` : '',
    params.overlayText ? `User overlay text (prefer this on slide 0 headline): ${params.overlayText}` : '',
    // The studio's own standing instructions. Last, so they win any tie with
    // the shipped wording — but still upstream of every guardrail in code.
    blocks.house_style ? `HOUSE RULES — this studio's own standing instructions:
${blocks.house_style}` : '',
    // Measured: the model composed slide 0 and silently omitted the rest, so
    // every later slide of a carousel fell back to a preset and consecutive
    // slides came out identical. Stating the count and the required indices
    // explicitly is the difference between a carousel and one slide repeated.
    params.plan.length > 1
      ? `THIS POST HAS ${params.plan.length} SLIDES. Your "slides" array MUST contain exactly ${params.plan.length} entries, one per index below (${params.plan.map((s) => s.index).join(', ')}), each with its OWN headline and its own copy. A carousel whose slides share one arrangement is a failure — move the photo and the type between slides so the sequence has rhythm. Slide 0 opens, the middle slides carry the substance, the last one asks for the booking.`
      : '',
    `Slides (index and label are fixed): ${JSON.stringify(slidesJson)}`,
  ].filter(Boolean).join('\n');
}

function parseCopyPacks(raw: string, source: CopyPack['source']): UnplannedPack[] {
  const text = raw.replace(/^```(?:json)?\n?/m, '').replace(/\n?```$/m, '').trim();
  let parsed: any;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    // Otherwise a parse failure is a silent empty-pack fallback with zero
    // way to tell why — this is the one place raw model output is visible.
    throw new Error(`${source} returned unparseable JSON (${(err as Error).message}): ${text.slice(0, 400)}`);
  }
  const rows = Array.isArray(parsed?.options)
    ? parsed.options
    : parsed?.slides
      ? [{ angle: 'Studio look', slides: parsed.slides, caption: parsed.caption }]
      : [];
  const packs: UnplannedPack[] = [];
  for (const row of rows.slice(0, OPTIONS_PER_PROVIDER)) {
    const byIndex = new Map<number, SlideCopy>();
    const slides = Array.isArray(row?.slides) ? row.slides : [];
    for (const slide of slides) {
      if (typeof slide?.index !== 'number') continue;
      const layout = LAB_LAYOUTS.includes(slide.layout) ? (slide.layout as LabLayout) : undefined;
      const decoration = LAB_DECORATIONS.includes(slide.decoration) ? (slide.decoration as LabDecoration) : undefined;
      byIndex.set(slide.index, {
        headline: String(slide.headline || '').trim(),
        subhead: String(slide.subhead || '').trim() || undefined,
        pill: String(slide.pill || '').trim() || undefined,
        cta: String(slide.cta || '').trim() || undefined,
        layout,
        decoration,
        // AI-authored numeric design brief — clamped here so anything
        // downstream (compositor) only ever sees safe, in-range values,
        // same discipline as layout/decoration validation just above.
        designSpec: clampDesignSpec(slide.design),
        // AI-authored geometry, passed through raw; the compositor's
        // validateComposition() is the single gate (it needs canvas dims
        // and the headline-fit test, which only exist at render time).
        composition: slide.composition && typeof slide.composition === 'object' ? slide.composition : undefined,
        // Format + its content. Coerced here so the renderer only ever sees
        // well-formed blocks; a format the model under-filled degrades to a
        // plain statement post rather than rendering an empty region.
        format: isPostFormatId(slide.format) ? slide.format : undefined,
        content: coerceFormatContent(slide.content),
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

function blacklistFromDna(dna: any): string[] {
  if (!dna) return [];
  return [
    ...(Array.isArray(dna.vocabularyBlacklist) ? dna.vocabularyBlacklist : []),
    ...(Array.isArray(dna.doNotSay) ? dna.doNotSay : []),
  ].map((w: unknown) => String(w)).filter(Boolean);
}

function formatCaptionForGate(caption: PostCaption): string {
  return [caption.hook, caption.body, caption.cta].filter(Boolean).join('\n\n');
}

function dataUrlToBuffer(dataUrl: string): Buffer {
  return Buffer.from(dataUrl.split(',')[1] ?? '', 'base64');
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

/**
 * Stops a slide's pill from contradicting the photograph under it.
 *
 * The copy model writes the pill, and on a transformation brief it reaches for
 * "BEFORE" regardless of which of the two photographs the layout actually
 * renders. A post showing the finished hair, captioned BEFORE, is worse than
 * one with no pill at all — and a split layout already labels each photo in
 * place, so a third BEFORE floating by the headline is just wrong.
 *
 * Telling the model which photo it is writing for was the obvious fix and is
 * the one this pipeline has learned not to trust. The render knows which photo
 * it drew; that is where the label is settled.
 */
/**
 * Which photo THIS option shows, given the option it is.
 *
 * The slide plan is built once for the whole run and shared by all four
 * options, so nothing in it can vary between them. That is how two opposite
 * bugs arrived from one line: while the rule resolved to 'before' every option
 * was the client's starting state, and once it resolved to 'after' every
 * option was the finished hair. Neither is a set of four options — a studio
 * uploading a pair wants the comparison used.
 *
 * The option index is only known here, so the spread lives here:
 *
 *   a pair layout   → both, always; it has two frames to fill
 *   one option in four → the before, so the set is not all one side
 *   the rest       → the after, which is the work being sold
 */
export function photoForOption(
  planned: LabSlideSpec['photo'],
  photoMode: string,
  optionIndex: number,
  hasA: boolean,
  hasB: boolean,
): LabSlideSpec['photo'] {
  // With one photo there is nothing to spread.
  if (!hasA || !hasB) return planned;
  if (photoMode === 'dual_framed') return 'both';
  // A single-photo layout cannot render 'both': the compositor would quietly
  // fall back to one of them anyway, and the pills would then disagree.
  return optionIndex % 4 === 1 ? 'before' : 'after';
}

export function reconcilePill(
  pill: string | undefined,
  photo: LabSlideSpec['photo'],
): string | undefined {
  if (!pill) return pill;
  const p = pill.trim().toUpperCase();
  const isBefore = /^BEFORE$/.test(p);
  const isAfter = /^AFTER$/.test(p);
  if (!isBefore && !isAfter) return pill;

  // Both photos are on the page with their own labels; a headline pill
  // repeating one of them mislabels half the post.
  if (photo === 'both') return undefined;
  if (photo === 'after' && isBefore) return 'AFTER';
  if (photo === 'before' && isAfter) return 'BEFORE';
  return pill;
}

function pillLabel(kind: PhotoKind | null | undefined): string {
  if (kind === 'bts') return 'BTS';
  if (kind === 'before') return 'BEFORE';
  if (kind === 'after') return 'AFTER';
  if (kind === 'detail') return 'DETAIL';
  return 'LOOK';
}

/**
 * Makes the option's assigned plan true of the composition that actually
 * renders, rather than true only of the prompt that asked for it.
 *
 * The model reliably returns `photoMode: "framed"` regardless of what it was
 * told — this was measured at 100% of runs, and the previous fix (a paragraph
 * insisting the two options must not both be framed) did not change it,
 * because a prompt cannot bind a model. Rewriting framed → full_bleed here is
 * well-defined: full_bleed ignores photoBox entirely and requires typeOnPhoto,
 * so the type region the model designed is preserved and only the photo's
 * treatment changes. The reverse rewrite is NOT safe (there would be no
 * authored photoBox to place), so it is never attempted — the plan simply
 * never assigns `framed` to an option that came back full_bleed of its own
 * accord, because that is already the variety we were asking for.
 *
 * photoShape and typeScale are filled in only where the model left them
 * blank; an explicit choice about this photo beats a blind assignment.
 */
function applyPlanToComposition(
  composition: LabCompositionInput | undefined,
  plan: OptionPlan,
): LabCompositionInput | undefined {
  if (!composition) return undefined;
  const out: LabCompositionInput = { ...composition };
  if (plan.photoMode === 'full_bleed' && composition.photoMode !== 'full_bleed') {
    out.photoMode = 'full_bleed';
    out.typeOnPhoto = true;
  }
  if (!out.photoShape) out.photoShape = plan.photoShape;
  if (!out.typeScale) out.typeScale = plan.typeScale;
  return out;
}

/**
 * The AI's layout choice for a slide, validated against what's actually
 * renderable for THIS slide's photos. "split" needs a real before/after
 * pair (framedPhoto is called on both before AND after) — anything else
 * only needs one hero photo, which is always guaranteed. Falls back to the
 * deterministic layoutFor() pick (still used to seed the AI's prompt and
 * as a safety net) whenever the AI omits a layout or picks something
 * infeasible for this slide.
 */
function sanitizeLayout(aiLayout: LabLayout | undefined, fallback: LabLayout, canSplit: boolean): LabLayout {
  if (!aiLayout) return fallback;
  if (aiLayout === 'split' && !canSplit) return fallback === 'split' ? 'cover' : fallback;
  return aiLayout;
}

function isZoneType(v: unknown): v is ZoneType {
  return v === 'photo' || v === 'text' || v === 'quote' || v === 'cta' || v === 'video';
}

// Zone type is a structural fact the template already encodes (see
// prisma/seed-templates.ts) — a stronger signal than guessing from label
// text alone. 'cta'/'quote'/'text' zones get layouts where the photo
// recedes (Gemini Lab has no true photo-free slide), instead of every
// slide collapsing to the same 'cover' default.
function layoutFor(label: string, index: number, count: number, hasA: boolean, hasB: boolean, isPair: boolean, zoneType: ZoneType | null = null): LabLayout {
  const l = label.toLowerCase();
  if (zoneType === 'cta') return 'framed_cta';
  if (zoneType === 'quote' || zoneType === 'text') return index === 0 ? 'minimal_caption' : 'stacked_quote';
  // This is only the seed for the slide's fallback headline/pill wording now.
  // The layout that actually renders — and therefore the preset geometry any
  // rejected composition lands on — is assigned per option in
  // creative-plan.ts, which is where the variety has to come from: a random
  // pick here could not vary the FOUR options of one generation against each
  // other, only one generation against the next.
  if (count === 1) return isPair && hasA && hasB ? 'split' : 'cover';
  if (/before\s*&\s*after|split|transformation/.test(l) && isPair && hasA && hasB) return 'split';
  if (/cta|book/.test(l) || (count > 1 && index === count - 1)) return 'framed_cta';
  if (/step|technique|educat/.test(l)) return 'type_step';
  if (index === 0) return 'cover';
  if (index === 1 && isPair && hasA && hasB) return 'split';
  return 'banner';
}

export function photoFor(label: string, index: number, count: number, hasA: boolean, hasB: boolean, isPair: boolean): LabSlideSpec['photo'] {
  const l = label.toLowerCase();
  if (/before\s*&\s*after|split/.test(l) && isPair && hasA && hasB) return 'both';
  if (isPair && /before|start/.test(l) && hasA) return 'before';
  if (isPair && /after|result|reveal|final/.test(l) && hasB) return 'after';

  if (hasA && hasB) {
    // The slot people actually see — a single-slide post, or the cover of a
    // carousel — shows the AFTER.
    //
    // This used to be `index % 2 === 0 ? 'before' : 'after'`, which reads as a
    // sensible alternation and is one for a carousel. But every option in a
    // single-slide run has index 0, so the expression could only ever return
    // 'before': uploading a before AND an after produced four posts of the
    // client's starting state, with "BEFORE" set as the pill. A lone before
    // advertises the problem instead of the work.
    if (count <= 1 || index === 0) return 'after';
    // Past the cover the pair tells its story in order.
    return index % 2 === 1 ? 'before' : 'after';
  }
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

/** Plain-language aspect of the technician's photo, so region choice can suit it instead of cropping it to pieces. */
async function describeAspect(buffer: Buffer): Promise<string | null> {
  try {
    const meta = await sharp(buffer).metadata();
    // EXIF orientation 5-8 means the stored pixels are rotated 90°.
    const swap = (meta.orientation ?? 1) >= 5;
    const width = (swap ? meta.height : meta.width) ?? 0;
    const height = (swap ? meta.width : meta.height) ?? 0;
    if (!width || !height) return null;
    const r = width / height;
    const shape = r > 1.25 ? 'landscape' : r < 0.8 ? 'portrait' : 'square';
    return `${shape} (${width}x${height}, ratio ${r.toFixed(2)})`;
  } catch {
    return null;
  }
}

async function fetchImageBuffer(url: string): Promise<Buffer> {
  if (url.startsWith('data:image/')) {
    return Buffer.from(url.split(',')[1] ?? '', 'base64');
  }
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching image`);
  return Buffer.from(await response.arrayBuffer());
}
