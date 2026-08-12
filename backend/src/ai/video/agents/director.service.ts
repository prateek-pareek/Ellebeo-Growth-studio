// ============================================================================
// director.service.ts — the Director agent: owns the Video Plan and runs the
// draft-then-critique loop. Since Phase 5, drafting is no longer "call Script
// agent once and done": after the Script agent writes scene copy, the Critic
// agent scores it, and if it's below CRITIC_PASS_THRESHOLD the Director
// re-runs the Script agent for ONLY the flagged weak scenes (targeted
// revision, not a full re-draft), bounded to MAX_CRITIC_REVISIONS. This is
// the agentic payoff described in the spec: money (render) is only spent on
// a plan that already passed review. Persists a placeholder row before
// calling any LLM so a crash mid-draft is observable rather than silently
// lost.
// ============================================================================

import type { PrismaClient } from '@prisma/client';
import type Anthropic from '@anthropic-ai/sdk';
import { runScriptAgent, ScriptAgentBrandVoice } from './script-agent';
import { runCriticAgent, CriticResult } from './critic-agent';
import { runComplianceAgent } from './compliance-agent';
import { buildSlideshowPlan } from '../slideshow-plan-builder';
import { buildReelsPlan } from '../reels-plan-builder';
import { VideoPlan, parseVideoPlan } from '../video-plan.schema';
import { DEFAULT_DURATION_SECONDS, MAX_CRITIC_REVISIONS, MAX_SCENE_DURATION_SECONDS, MIN_SCENE_DURATION_SECONDS } from '../video-plan.constants';
import { SlideshowAssetProvider } from '../assets/slideshow-asset-provider';
import { ReelsAssetProvider } from '../assets/reels-asset-provider';
import type { AssetProvider, SceneCopy } from '../assets/asset-provider';
import { filterClientPhotos } from '../compliance/client-photo-gate';
import { filterSceneCopyForCompliance } from '../compliance/copy-compliance-gate';

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
  /** Parallel to imageUrls — true means "this is a real client photo." Blocked when medicalAesthetics is true. */
  clientPhotoFlags?: boolean[];
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
  /** Parallel to imageUrls — true means "this is a real client photo." Blocked when medicalAesthetics is true. */
  clientPhotoFlags?: boolean[];
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

    // Compliance hard gate on imagery: unconditional, code-level, applied
    // before anything downstream ever sees a blocked url. This rule-based
    // builder has no stock fallback (unlike the AssetProvider path reels
    // uses) — a blocked image is dropped, which reduces scene count rather
    // than being substituted. Documented Phase 6 scope: adding a stock
    // fallback here is a trivial follow-up once draftSlideshowPlan is wired
    // through SlideshowAssetProvider (see Phase 4's notes on that).
    const safeImageUrls = filterClientPhotos(params.imageUrls, params.clientPhotoFlags, params.medicalAesthetics ?? false)
      .filter((url): url is string => !!url);
    if (safeImageUrls.length === 0) {
      throw new DirectorError('All supplied images were blocked by the medical-aesthetics compliance gate — no compliant images remain');
    }

    // Step 1: a bare, image-only plan (no copy yet) — persisted immediately
    // so the row exists even if the Script agent call below fails.
    const placeholderPlan = buildSlideshowPlan({
      technicianId: params.technicianId,
      brandDnaRef: params.brandDnaId,
      imageUrls: safeImageUrls,
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

    // Step 2: Script agent drafts, Critic agent reviews, targeted revisions
    // loop bounded to MAX_CRITIC_REVISIONS.
    let sceneCopy: SceneCopy[];
    let critic: DirectorCriticOutcome;
    try {
      const initialScript = await runScriptAgent({
        sceneCount: safeImageUrls.length,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        client: params.anthropicClient,
      });
      const initialSceneCopy: SceneCopy[] = initialScript.output.scenes.map((s) => ({
        index: s.index,
        headline: s.headline,
        caption: s.caption,
      }));

      const criticOutcome = await this.runCriticLoop({
        sceneCopy: initialSceneCopy,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        anthropicClient: params.anthropicClient,
      });

      ({ sceneCopy, critic } = await this.runComplianceReview({
        sceneCopy: criticOutcome.sceneCopy,
        critic: criticOutcome.critic,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        anthropicClient: params.anthropicClient,
      }));
    } catch (err) {
      await this.prisma.videoPlan.update({
        where: { id: row.id },
        data: { status: 'failed', errorMessage: err instanceof Error ? err.message : String(err) },
      });
      throw err;
    }

    const headlines: (string | null)[] = [];
    const captions: (string | null)[] = [];
    for (const scene of sceneCopy) {
      headlines[scene.index] = scene.headline;
      captions[scene.index] = scene.caption;
    }

    const finalPlan = buildSlideshowPlan({
      technicianId: params.technicianId,
      brandDnaRef: params.brandDnaId,
      imageUrls: safeImageUrls,
      objective: params.objective,
      headlines,
      captions,
      brandFont: params.brandFont,
      brandPalette: params.brandPalette,
      totalDurationSeconds: params.totalDurationSeconds,
      medicalAesthetics: params.medicalAesthetics,
      critic: toCriticPlanField(critic),
    });

    await this.prisma.videoPlan.update({
      where: { id: row.id },
      data: { status: 'in_review', plan: finalPlan, criticStatus: critic.passed ? 'passed' : 'failed', criticScore: critic.score, criticRevisions: critic.revisions ?? 0 },
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
      const initialScript = await runScriptAgent({
        sceneCount: params.sceneCount,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        client: params.anthropicClient,
      });
      const initialSceneCopy: SceneCopy[] = initialScript.output.scenes.map((s) => ({
        index: s.index,
        headline: s.headline,
        caption: s.caption,
      }));

      const criticOutcome = await this.runCriticLoop({
        sceneCopy: initialSceneCopy,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        anthropicClient: params.anthropicClient,
      });

      const { sceneCopy, critic } = await this.runComplianceReview({
        sceneCopy: criticOutcome.sceneCopy,
        critic: criticOutcome.critic,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics ?? false,
        anthropicClient: params.anthropicClient,
      });

      const assetProvider = params.assetProvider ?? new ReelsAssetProvider(new SlideshowAssetProvider());
      const assetResult = await assetProvider.resolveSceneAssets({
        tenantId: params.tenantId,
        sceneCopy,
        technicianImageUrls: params.imageUrls,
        clientPhotoFlags: params.clientPhotoFlags,
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
        critic: toCriticPlanField(critic),
      });

      await this.prisma.videoPlan.update({
        where: { id: row.id },
        data: {
          status: 'in_review',
          plan: finalPlan,
          durationSeconds: finalPlan.durationSeconds,
          criticStatus: critic.passed ? 'passed' : 'failed',
          criticScore: critic.score,
          criticRevisions: critic.revisions,
        },
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

  // --------------------------------------------------------------------------
  // The critic loop (Phase 5): score the draft, and if it's below threshold,
  // ask the Script agent to rewrite ONLY the flagged weak scenes — not a full
  // re-draft. Bounded to MAX_CRITIC_REVISIONS; the loop always terminates
  // with the last critique's score/notes recorded, whether it passed or not
  // (a plan that never passes still reaches the technician for review, with
  // the critic's notes visible — it just isn't marked passed).
  // --------------------------------------------------------------------------

  private async runCriticLoop(params: {
    sceneCopy: SceneCopy[];
    objective: string;
    brandVoice: ScriptAgentBrandVoice;
    medicalAesthetics: boolean;
    anthropicClient?: Anthropic;
  }): Promise<{ sceneCopy: SceneCopy[]; critic: DirectorCriticOutcome }> {
    let sceneCopy = params.sceneCopy;
    let revisions = 0;
    let critique = await runCriticAgent({
      scenes: sceneCopy,
      objective: params.objective,
      brandVoice: params.brandVoice,
      medicalAesthetics: params.medicalAesthetics,
      client: params.anthropicClient,
    });

    while (!critique.passed && critique.weakSceneIndices.length > 0 && revisions < MAX_CRITIC_REVISIONS) {
      revisions++;

      const revisionResult = await runScriptAgent({
        sceneCount: critique.weakSceneIndices.length,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics,
        client: params.anthropicClient,
        revision: {
          indices: critique.weakSceneIndices,
          notes: critique.notes,
          previousScenes: sceneCopy,
        },
      });

      sceneCopy = mergeSceneCopy(sceneCopy, revisionResult.output.scenes);

      critique = await runCriticAgent({
        scenes: sceneCopy,
        objective: params.objective,
        brandVoice: params.brandVoice,
        medicalAesthetics: params.medicalAesthetics,
        client: params.anthropicClient,
      });
    }

    return { sceneCopy, critic: { ...critique, revisions } };
  }

  // --------------------------------------------------------------------------
  // Compliance (Phase 6): two layers. The Compliance agent (reasoning, only
  // for medical-aesthetics brands) gets exactly one targeted revision pass
  // for anything it flags — not a loop, since it's a review pass, not a
  // quality bar to converge on. The copy hard gate then runs UNCONDITIONALLY
  // for every video regardless of medicalAesthetics (same as how
  // OutputValidator is already applied to every caption in the main content
  // pipeline) — it is the certain backstop, the agent is the smart layer.
  // --------------------------------------------------------------------------

  private async runComplianceReview(params: {
    sceneCopy: SceneCopy[];
    critic: DirectorCriticOutcome;
    objective: string;
    brandVoice: ScriptAgentBrandVoice;
    medicalAesthetics: boolean;
    anthropicClient?: Anthropic;
  }): Promise<{ sceneCopy: SceneCopy[]; critic: DirectorCriticOutcome }> {
    let sceneCopy = params.sceneCopy;
    const complianceNotes: string[] = [];

    if (params.medicalAesthetics) {
      const review = await runComplianceAgent({
        scenes: sceneCopy,
        brandVoice: params.brandVoice,
        client: params.anthropicClient,
      });

      if (review.output.flaggedSceneIndices.length > 0) {
        const revisionResult = await runScriptAgent({
          sceneCount: review.output.flaggedSceneIndices.length,
          objective: params.objective,
          brandVoice: params.brandVoice,
          medicalAesthetics: true,
          client: params.anthropicClient,
          revision: {
            indices: review.output.flaggedSceneIndices,
            notes: review.output.reasons,
            previousScenes: sceneCopy,
          },
        });
        sceneCopy = mergeSceneCopy(sceneCopy, revisionResult.output.scenes);
        complianceNotes.push(...review.output.reasons.map((r) => `Compliance agent: ${r}`));
      }
    }

    // The hard gate — unconditional, code-level, no LLM in this step.
    const gateResult = await filterSceneCopyForCompliance(sceneCopy);
    sceneCopy = gateResult.sceneCopy;
    complianceNotes.push(
      ...gateResult.violations.map((v) => `Compliance hard gate: scene ${v.index} ${v.field} removed (${v.reasons.join('; ')})`),
    );

    return {
      sceneCopy,
      critic: complianceNotes.length > 0 ? { ...params.critic, notes: [...params.critic.notes, ...complianceNotes] } : params.critic,
    };
  }
}

interface DirectorCriticOutcome extends CriticResult {
  revisions: number;
}

function mergeSceneCopy(original: SceneCopy[], revised: Array<{ index: number; headline: string | null; caption: string | null }>): SceneCopy[] {
  const byIndex = new Map(original.map((s) => [s.index, s]));
  for (const scene of revised) {
    byIndex.set(scene.index, scene);
  }
  return Array.from(byIndex.values()).sort((a, b) => a.index - b.index);
}

function toCriticPlanField(critic: DirectorCriticOutcome) {
  return {
    score: critic.score,
    status: critic.passed ? ('passed' as const) : ('failed' as const),
    passed: critic.passed,
    revisions: critic.revisions,
    notes: critic.notes,
  };
}

function buildPlaceholderReelsPlan(params: DraftReelsPlanParams): VideoPlan {
  const perScene = Math.min(
    MAX_SCENE_DURATION_SECONDS,
    Math.max(MIN_SCENE_DURATION_SECONDS, Math.round(DEFAULT_DURATION_SECONDS / params.sceneCount)),
  );
  const scenes = Array.from({ length: params.sceneCount }, (_, index) => ({
    index,
    durationSeconds: perScene,
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
