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
import { VideoPlan } from '../video-plan.schema';
import { DEFAULT_DURATION_SECONDS } from '../video-plan.constants';

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
}
