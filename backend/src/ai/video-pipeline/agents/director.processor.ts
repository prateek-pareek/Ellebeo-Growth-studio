import { AI_CONFIG } from '../../../config/ai.config';
import type { AssetProvider } from '../assets/asset-provider';
import { defaultVoiceId } from '../assets/voice-id';
import type { VoiceoverAsset, VoiceoverPort } from '../assets/voiceover.port';
import { assertVideoPlanHardGate, ComplianceHardGateError } from '../compliance/hard-gate';
import { DEFAULT_CRITIC_MAX_REVISIONS, parseVideoPlan, type VideoPlan } from '../contract';
import { applyResolvedAssetsToPlan, applyVoiceoverToPlan } from '../core/plan-overlays';
import { videoJobDenormalizedFields } from '../core/plan-status';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
import { runComplianceAgent } from './compliance.agent';
import { runCriticAgent, type CriticResult } from './critic.agent';
import type { LlmPort } from './llm-port';
import {
  AgentBudgetError,
  AgentRuntimeError,
  createAgentBudget,
  type AgentBudget,
} from './runtime';
import { runScriptAgent } from './script.agent';
import { scriptDraftSchema, type ScriptDraft } from './script.schema';

export const DIRECTOR_STEPS = [
  'created',
  'assets',
  'scripted',
  'assembled',
  'reviewed',
  'render_queued',
  'failed',
] as const;
export type DirectorStep = (typeof DIRECTOR_STEPS)[number];

export interface DirectorLoopState {
  step: DirectorStep;
  scriptDraft?: ScriptDraft;
  brandVoice?: string;
  tokensUsed: number;
  costUsd: number;
  toolCalls: number;
  repaired: boolean;
  error?: string;
  assetsResolved?: boolean;
  requestedSceneCount?: number;
  stockQuery?: string;
  voiceId?: string;
  voiceover?: VoiceoverAsset;
  useAiClips?: boolean;
  clipPrompts?: string[];
}

export interface DirectorJobRecord {
  id: string;
  tenantId: string;
  status: string;
  plan: unknown;
  tokensUsed: number;
  estimatedCostUsd: number | null;
  revisionCount: number;
  loopState: unknown;
}

export interface DirectorStore {
  videoJob: {
    findUnique: (args: { where: { id: string } }) => Promise<DirectorJobRecord | null>;
    update: (args: {
      where: { id: string };
      data: Record<string, unknown>;
    }) => Promise<unknown>;
  };
  videoPlanRevision?: {
    create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
  };
}

export interface DirectorPayload {
  videoJobId: string;
  tenantId: string;
}

export class DirectorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'DirectorError';
  }
}

const TERMINAL_JOB = new Set(['RENDERING', 'RENDERED', 'PUBLISHED']);

export function parseLoopState(raw: unknown): DirectorLoopState {
  if (!raw || typeof raw !== 'object') {
    return {
      step: 'created',
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      repaired: false,
    };
  }
  const value = raw as Partial<DirectorLoopState>;
  const step = DIRECTOR_STEPS.includes(value.step as DirectorStep)
    ? (value.step as DirectorStep)
    : 'created';
  let scriptDraft: ScriptDraft | undefined;
  if (value.scriptDraft) {
    const parsed = scriptDraftSchema.safeParse(value.scriptDraft);
    if (parsed.success) scriptDraft = parsed.data;
  }
  return {
    step,
    scriptDraft,
    brandVoice: typeof value.brandVoice === 'string' ? value.brandVoice : undefined,
    tokensUsed: typeof value.tokensUsed === 'number' ? value.tokensUsed : 0,
    costUsd: typeof value.costUsd === 'number' ? value.costUsd : 0,
    toolCalls: typeof value.toolCalls === 'number' ? value.toolCalls : 0,
    repaired: Boolean(value.repaired),
    error: typeof value.error === 'string' ? value.error : undefined,
    assetsResolved: Boolean(value.assetsResolved),
    requestedSceneCount:
      typeof value.requestedSceneCount === 'number' ? value.requestedSceneCount : undefined,
    stockQuery: typeof value.stockQuery === 'string' ? value.stockQuery : undefined,
    voiceId: typeof value.voiceId === 'string' ? value.voiceId : undefined,
    voiceover: isVoiceoverAsset(value.voiceover) ? value.voiceover : undefined,
    useAiClips: Boolean(value.useAiClips),
    clipPrompts: Array.isArray(value.clipPrompts)
      ? value.clipPrompts.filter((p): p is string => typeof p === 'string')
      : undefined,
  };
}

function isVoiceoverAsset(value: unknown): value is VoiceoverAsset {
  if (!value || typeof value !== 'object') return false;
  const asset = value as VoiceoverAsset;
  return (
    typeof asset.assetUrl === 'string' &&
    typeof asset.durationSeconds === 'number' &&
    typeof asset.voiceId === 'string' &&
    typeof asset.script === 'string'
  );
}

export function applyCriticToPlan(plan: VideoPlan, result: CriticResult, revisions: number): VideoPlan {
  return parseVideoPlan({
    ...plan,
    critic: {
      score: result.score,
      passed: result.passed,
      revisions,
      notes: result.notes,
    },
  });
}

export function applyScriptDraftToPlan(plan: VideoPlan, script: ScriptDraft): VideoPlan {
  const scenes = plan.scenes.map((scene, index) => {
    const draft = script.scenes.find((item) => item.index === index) ?? script.scenes[index];
    return {
      ...scene,
      text: {
        headline: (index === 0 ? script.hook : draft?.headline) ?? scene.text.headline,
        caption: draft?.caption ?? scene.text.caption,
        position: draft?.position ?? scene.text.position,
      },
    };
  });

  return parseVideoPlan({
    ...plan,
    scenes,
    audio: {
      ...plan.audio,
      voiceover: {
        ...plan.audio.voiceover,
        enabled: false,
        script: script.voiceoverScript,
      },
    },
    meta: {
      ...plan.meta,
      source: 'agentic_v1',
    },
  });
}

export async function processDirectorJob(
  deps: {
    prisma: DirectorStore;
    llm: LlmPort;
    enqueueRender?: (videoJobId: string, tenantId: string) => Promise<unknown>;
    isEnabled?: () => boolean;
    budget?: Partial<AgentBudget>;
    assetProvider?: AssetProvider;
    voiceover?: VoiceoverPort;
    maxCriticRevisions?: number;
    runComplianceAgent?: boolean;
  },
  payload: DirectorPayload,
): Promise<{ status: string; step: DirectorStep; videoJobId: string }> {
  if (!(deps.isEnabled ?? isGrowthStudioVideoEnabled)()) {
    throw new DirectorError('GROWTH_STUDIO_VIDEO is off');
  }

  const row = await deps.prisma.videoJob.findUnique({ where: { id: payload.videoJobId } });
  if (!row || row.tenantId !== payload.tenantId) {
    throw new DirectorError(`VideoJob ${payload.videoJobId} not found`);
  }
  if (TERMINAL_JOB.has(row.status)) {
    return { status: row.status, step: 'render_queued', videoJobId: row.id };
  }

  let state = parseLoopState(row.loopState);
  if (state.step === 'render_queued') {
    return { status: row.status, step: state.step, videoJobId: row.id };
  }

  const budget = createAgentBudget({
    tokensUsed: state.tokensUsed,
    costUsd: state.costUsd,
    toolCalls: state.toolCalls,
    ...deps.budget,
  });

  try {
    if (deps.assetProvider && !state.assetsResolved) {
      const plan = parseVideoPlan(row.plan);
      const resolved = await deps.assetProvider.resolve({
        videoType: plan.videoType,
        sceneCount: state.requestedSceneCount ?? plan.scenes.length,
        technicianAssets: plan.scenes.map((scene) => ({
          url: scene.asset.url ?? '',
          assetId: scene.asset.assetId,
          kind: scene.asset.kind,
        })),
        query: state.stockQuery,
        medicalAesthetics: plan.compliance.medicalAesthetics,
        preferAiClips: state.useAiClips,
        clipPrompts: state.clipPrompts,
      });
      const nextPlan = applyResolvedAssetsToPlan(plan, resolved);
      state = { ...state, step: 'assets', assetsResolved: true, error: undefined };
      await persistDirector(deps.prisma, row.id, {
        ...videoJobDenormalizedFields(nextPlan),
        loopState: state,
      });
      row.plan = nextPlan;
    }

    if (!state.scriptDraft) {
      const plan = parseVideoPlan(row.plan);
      const script = await runScriptAgent(
        {
          sceneCount: plan.scenes.length,
          objective: plan.objective,
          brandVoice: state.brandVoice ?? '',
          medicalAesthetics: plan.compliance.medicalAesthetics,
          videoType: plan.videoType,
          requireVoiceover: plan.videoType === 'REELS',
          imageNotes: plan.scenes.map(
            (scene, index) =>
              scene.text.headline ?? `${scene.asset.kind.toLowerCase()} ${index + 1}`,
          ),
        },
        deps.llm,
        budget,
      );
      state = {
        ...state,
        step: 'scripted',
        scriptDraft: script.output,
        tokensUsed: budget.tokensUsed,
        costUsd: budget.costUsd,
        toolCalls: budget.toolCalls,
        repaired: state.repaired || script.repaired,
        error: undefined,
      };
      await persistDirector(deps.prisma, row.id, {
        loopState: state,
        tokensUsed: budget.tokensUsed,
        estimatedCostUsd: budget.costUsd,
      });
    }

    if (
      state.step !== 'assembled' &&
      state.step !== 'reviewed' &&
      state.step !== 'render_queued' &&
      state.scriptDraft
    ) {
      const assembled = await assembleFromScript(parseVideoPlan(row.plan), state, deps.voiceover);
      state = assembled.state;
      const plan = assembled.plan;
      state = {
        ...state,
        step: 'assembled',
        tokensUsed: budget.tokensUsed,
        costUsd: budget.costUsd,
        toolCalls: budget.toolCalls,
      };
      await persistDirector(deps.prisma, row.id, {
        ...videoJobDenormalizedFields(plan),
        loopState: state,
        tokensUsed: budget.tokensUsed,
        estimatedCostUsd: budget.costUsd,
      });
      row.plan = plan;
    }

    if (state.step === 'assembled' && state.scriptDraft) {
      const maxRevisions =
        deps.maxCriticRevisions ??
        AI_CONFIG.video.defaultCriticMaxRevisions ??
        DEFAULT_CRITIC_MAX_REVISIONS;
      let plan = parseVideoPlan(row.plan);

      for (let attempt = 0; attempt <= maxRevisions; attempt++) {
        const critique = await runCriticAgent(
          { plan, brandVoice: state.brandVoice },
          deps.llm,
          budget,
        );
        plan = applyCriticToPlan(plan, critique, attempt);
        state = {
          ...state,
          tokensUsed: budget.tokensUsed,
          costUsd: budget.costUsd,
          toolCalls: budget.toolCalls,
          repaired: state.repaired || critique.repaired,
        };
        const revision = row.revisionCount;
        await persistDirector(deps.prisma, row.id, {
          ...videoJobDenormalizedFields(plan),
          loopState: state,
          tokensUsed: budget.tokensUsed,
          estimatedCostUsd: budget.costUsd,
          revisionCount: revision + 1,
        });
        if (deps.prisma.videoPlanRevision) {
          await deps.prisma.videoPlanRevision.create({
            data: {
              videoJobId: row.id,
              revision,
              plan,
              criticScore: critique.score,
              criticPassed: critique.passed,
              criticNotes: critique.notes,
            },
          });
        }
        row.revisionCount = revision + 1;
        row.plan = plan;

        if (critique.passed || attempt >= maxRevisions) {
          state = { ...state, step: 'reviewed' };
          await persistDirector(deps.prisma, row.id, {
            ...videoJobDenormalizedFields(plan),
            loopState: state,
          });
          break;
        }

        const revised = await runScriptAgent(
          {
            sceneCount: plan.scenes.length,
            objective: plan.objective,
            brandVoice: state.brandVoice ?? '',
            medicalAesthetics: plan.compliance.medicalAesthetics,
            videoType: plan.videoType,
            requireVoiceover: plan.videoType === 'REELS',
            reviseNotes: critique.notes,
            imageNotes: plan.scenes.map(
              (scene, index) =>
                scene.text.headline ?? `${scene.asset.kind.toLowerCase()} ${index + 1}`,
            ),
          },
          deps.llm,
          budget,
        );
        state = {
          ...state,
          scriptDraft: revised.output,
          tokensUsed: budget.tokensUsed,
          costUsd: budget.costUsd,
          toolCalls: budget.toolCalls,
          repaired: state.repaired || revised.repaired,
        };
        const failedRevisions = plan.critic.revisions;
        const next = await assembleFromScript(parseVideoPlan(row.plan), state, deps.voiceover);
        state = next.state;
        plan = parseVideoPlan({
          ...next.plan,
          critic: {
            score: null,
            passed: false,
            revisions: failedRevisions + 1,
            notes: critique.notes,
          },
        });
        state = { ...state, step: 'assembled' };
        await persistDirector(deps.prisma, row.id, {
          ...videoJobDenormalizedFields(plan),
          loopState: state,
          tokensUsed: budget.tokensUsed,
          estimatedCostUsd: budget.costUsd,
        });
        row.plan = plan;
      }
    }

    if (state.step === 'reviewed') {
      const plan = parseVideoPlan(row.plan);
      assertVideoPlanHardGate(plan);
      if (deps.runComplianceAgent) {
        const edge = await runComplianceAgent(plan, deps.llm, budget);
        if (edge.block) {
          throw new ComplianceHardGateError(
            `Compliance agent blocked render: ${edge.notes.join('; ')}`,
            edge.notes,
          );
        }
      }
      if (deps.enqueueRender) {
        await deps.enqueueRender(row.id, row.tenantId);
      }
      state = { ...state, step: 'render_queued' };
      await persistDirector(deps.prisma, row.id, { loopState: state });
    }

    return { status: 'DRAFT', step: state.step, videoJobId: row.id };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Director failed';
    state = { ...state, step: 'failed', error: message, tokensUsed: budget.tokensUsed, costUsd: budget.costUsd };
    await persistDirector(deps.prisma, row.id, {
      loopState: state,
      tokensUsed: budget.tokensUsed,
      estimatedCostUsd: budget.costUsd,
      status: 'FAILED',
    });
    if (
      err instanceof AgentBudgetError ||
      err instanceof AgentRuntimeError ||
      err instanceof DirectorError ||
      err instanceof ComplianceHardGateError
    ) {
      throw err;
    }
    throw new DirectorError(message);
  }
}

async function assembleFromScript(
  base: VideoPlan,
  state: DirectorLoopState,
  voiceoverPort?: VoiceoverPort,
): Promise<{ plan: VideoPlan; state: DirectorLoopState }> {
  if (!state.scriptDraft) {
    throw new DirectorError('No script draft to assemble');
  }
  let plan = applyScriptDraftToPlan(base, state.scriptDraft);
  let nextState = state;
  if (plan.videoType === 'REELS' && voiceoverPort) {
    const scriptText =
      state.scriptDraft.voiceoverScript?.trim() ||
      [state.scriptDraft.hook, ...state.scriptDraft.scenes.map((scene) => scene.headline)]
        .filter(Boolean)
        .join('. ');
    if (nextState.voiceover?.script === scriptText) {
      plan = applyVoiceoverToPlan(plan, nextState.voiceover);
    } else {
      const synthesized = await voiceoverPort.synthesize({
        script: scriptText,
        voiceId: nextState.voiceId ?? defaultVoiceId(),
      });
      const voiceover: VoiceoverAsset = { ...synthesized, script: scriptText };
      nextState = { ...nextState, voiceover };
      plan = applyVoiceoverToPlan(plan, voiceover);
    }
  } else if (plan.videoType === 'REELS' && nextState.voiceover) {
    plan = applyVoiceoverToPlan(plan, nextState.voiceover);
  }
  return { plan, state: nextState };
}

async function persistDirector(
  prisma: DirectorStore,
  videoJobId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await prisma.videoJob.update({ where: { id: videoJobId }, data });
}
