// ============================================================================
// director.service.ts — the Director agent: owns the Video Plan and runs the
// drafting loop. Phase 3 scope is single-step (draft via Script agent only —
// Asset/Compliance/Critic steps land in Phases 4-6 and will extend this same
// loop, not replace it). Persists a placeholder row before calling any LLM so
// a crash mid-draft is observable rather than silently lost — the multi-step
// resumable state machine deepens once the critic loop (Phase 5) exists.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { runScriptAgent, ScriptAgentBrandVoice } from './script-agent';
import { buildSlideshowPlan } from '../slideshow-plan-builder';
import { buildReelsPlan } from '../reels-plan-builder';
import { VideoPlan, parseVideoPlan } from '../video-plan.schema';
import { DEFAULT_DURATION_SECONDS } from '../video-plan.constants';
import { SlideshowAssetProvider } from '../assets/slideshow-asset-provider';
import { ReelsAssetProvider } from '../assets/reels-asset-provider';
import type { AssetProvider, SceneCopy } from '../assets/asset-provider';

export class DirectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorError';
  }
}

export interface DraftSlideshowPlanParams {
  tenantId: string;
  appointmentId: string;
  clientId: string;
  technicianId: string;
  brandDnaId: string;
  imageUrls: string[];
  objective: VideoPlan['objective'];
  brandVoice: ScriptAgentBrandVoice;
  brandFont?: string | null;
  brandPalette?: string[];
  medicalAesthetics?: boolean;
  totalDurationSeconds?: number;
  anthropicClient?: Anthropic;
}

export interface DraftSlideshowPlanResult {
  videoPlanId: string;
  plan: VideoPlan;
}

export interface DraftReelsPlanParams {
  tenantId: string;
  appointmentId: string;
  clientId: string;
  technicianId: string;
  brandDnaId: string;
  /** Technician-supplied images, in scene order. May be fewer than sceneCount — gaps are filled by the Asset agent. */
  imageUrls: string[];
  sceneCount: number;
  objective: VideoPlan['objective'];
  brandVoice: ScriptAgentBrandVoice;
  brandTone: string | null;
  brandMoodTag: string | null;
  brandFont?: string | null;
  brandPalette?: string[];
  medicalAesthetics?: boolean;
  voiceoverEnabled: boolean;
  anthropicClient?: Anthropic;
  assetProvider?: AssetProvider;
}

export class DirectorService {
  constructor(private readonly prisma: PrismaClient) {}

  async draftSlideshowPlan(params: DraftSlideshowPlanParams): Promise<DraftSlideshowPlanResult> {
    if (params.imageUrls.length === 0) {
      throw new DirectorError('At least one image is required to draft a slideshow plan');
    }

    // Step 1: a bare, image-only plan (no copy yet) — persisted immediately
    // so the row exists even if the Script agent call below fails.
    const placeholderPlan = buildSlideshowPlan({
      technicianId: params.technicianId,
      brandDnaRef: params.brandDnaId,
      imageUrls: params.imageUrls,
      objective: params.objective,
      brandFont: params.brandFont,
      brandPalette: params.brandPalette,
      totalDurationSeconds: params.totalDurationSeconds,
      medicalAesthetics: params.medicalAesthetics,
    });

    const row = await this.prisma.videoPlan.create({
      data: {
        tenantId: params.tenantId,
        appointmentId: params.appointmentId,
        clientId: params.clientId,
        technicianId: params.technicianId,
        brandDnaId: params.brandDnaId,
        videoType: 'slideshow',
        objective: params.objective,
        durationSeconds: params.totalDurationSeconds ?? DEFAULT_DURATION_SECONDS,
        status: 'draft',
        plan: placeholderPlan,
      },
    });

    // Step 2: Script agent writes the per-scene copy.
    let scriptResult;
    try {
      scriptResult = await runScriptAgent({
        sceneCount: params.imageUrls.length,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        client: params.anthropicClient,
      });
    } catch (err) {
      await this.prisma.videoPlan.update({
        where: { id: row.id },
        data: { status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }

    const headlines: (string | null)[] = [];
    const captions: (string | null)[] = [];
    for (const scene of scriptResult.output.scenes) {
      headlines[scene.index] = scene.headline;
      captions[scene.index] = scene.caption;
    }

    const finalPlan = buildSlideshowPlan({
      technicianId: params.technicianId,
      brandDnaRef: params.brandDnaId,
      imageUrls: params.imageUrls,
      objective: params.objective,
      headlines,
      captions,
      brandFont: params.brandFont,
      brandPalette: params.brandPalette,
      totalDurationSeconds: params.totalDurationSeconds,
      medicalAesthetics: params.medicalAesthetics,
    });

    await this.prisma.videoPlan.update({
      where: { id: row.id },
      data: { status: 'in_review', plan: finalPlan },
    });

    return { videoPlanId: row.id, plan: finalPlan };
  }

  // --------------------------------------------------------------------------
  // Reels: Script agent (copy) → Asset agent/provider (images + voiceover +
  // auto-timed captions). Same placeholder-row-first pattern as slideshow.
  // --------------------------------------------------------------------------

  async draftReelsPlan(params: DraftReelsPlanParams): Promise<DraftSlideshowPlanResult> {
    if (params.sceneCount <= 0) {
      throw new DirectorError('At least one scene is required to draft a reels plan');
    }

    const placeholderPlan = buildPlaceholderReelsPlan(params);
    const row = await this.prisma.videoPlan.create({
      data: {
        tenantId: params.tenantId,
        appointmentId: params.appointmentId,
        clientId: params.clientId,
        technicianId: params.technicianId,
        brandDnaId: params.brandDnaId,
        videoType: 'reels',
        objective: params.objective,
        durationSeconds: DEFAULT_DURATION_SECONDS,
        status: 'draft',
        plan: placeholderPlan,
      },
    });

    try {
      const scriptResult = await runScriptAgent({
        sceneCount: params.sceneCount,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        client: params.anthropicClient,
      });

      const sceneCopy: SceneCopy[] = scriptResult.output.scenes.map((s) => ({
        index: s.index,
        headline: s.headline,
        caption: s.caption,
      }));

      const assetProvider = params.assetProvider ?? new ReelsAssetProvider(new SlideshowAssetProvider());
      const assetResult = await assetProvider.resolveSceneAssets({
        tenantId: params.tenantId,
        sceneCopy,
        technicianImageUrls: params.imageUrls,
        brandMoodTag: params.brandMoodTag,
        brandTone: params.brandTone,
        medicalAesthetics: params.medicalAesthetics ?? false,
        voiceoverEnabled: params.voiceoverEnabled,
      });

      const finalPlan = buildReelsPlan({
        technicianId: params.technicianId,
        brandDnaRef: params.brandDnaId,
        objective: params.objective,
        sceneCopy,
        resolvedAssets: assetResult.scenes,
        voiceover: assetResult.voiceover,
        brandFont: params.brandFont,
        brandPalette: params.brandPalette,
        medicalAesthetics: params.medicalAesthetics,
      });

      await this.prisma.videoPlan.update({
        where: { id: row.id },
        data: { status: 'in_review', plan: finalPlan, durationSeconds: finalPlan.durationSeconds },
      });

      return { videoPlanId: row.id, plan: finalPlan };
    } catch (err) {
      await this.prisma.videoPlan.update({
        where: { id: row.id },
        data: { status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }
  }
}

function buildPlaceholderReelsPlan(params: DraftReelsPlanParams): VideoPlan {
  const scenes = Array.from({ length: params.sceneCount }, (_, index) => ({
    index,
    durationSeconds: Math.max(2, Math.round(DEFAULT_DURATION_SECONDS / params.sceneCount)),
    asset: { kind: 'image', url: params.imageUrls[index] ?? null },
    motion: 'none',
    text: { headline: null, caption: null, position: 'bottom' },
    transitionOut: 'fade',
  }));

  return parseVideoPlan({
    technicianId: params.technicianId,
    brandDnaRef: params.brandDnaId,
    videoType: 'reels',
    durationSeconds: DEFAULT_DURATION_SECONDS,
    objective: params.objective,
    scenes,
    audio: { voiceover: { enabled: false }, music: { mood: params.brandMoodTag } },
    captions: { enabled: true, style: 'bold', burnedIn: true },
    branding: { palette: params.brandPalette ?? [], font: params.brandFont ?? null },
    compliance: { medicalAesthetics: params.medicalAesthetics ?? false },
    critic: {},
    render: {},
    meta: { createdAt: new Date().toISOString() },
  });
}
