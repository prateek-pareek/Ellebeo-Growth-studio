import { parseVideoPlan, type VideoPlan } from '../contract';
import { videoJobDenormalizedFields } from '../core/plan-status';
import { isGrowthStudioVideoEnabled } from '../feature-flag';
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
  'scripted',
  'assembled',
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
  };
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
    if (!state.scriptDraft) {
      const plan = parseVideoPlan(row.plan);
      const script = await runScriptAgent(
        {
          sceneCount: plan.scenes.length,
          objective: plan.objective,
          brandVoice: state.brandVoice ?? '',
          medicalAesthetics: plan.compliance.medicalAesthetics,
          imageNotes: plan.scenes.map(
            (scene, index) =>
              scene.text.headline ?? `still image ${index + 1}`,
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

    if (state.step !== 'assembled' && state.step !== 'render_queued' && state.scriptDraft) {
      const plan = applyScriptDraftToPlan(parseVideoPlan(row.plan), state.scriptDraft);
      state = {
        ...state,
        step: 'assembled',
        tokensUsed: budget.tokensUsed,
        costUsd: budget.costUsd,
        toolCalls: budget.toolCalls,
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
          },
        });
      }
      row.plan = plan;
      row.revisionCount = revision + 1;
    }

    if (state.step === 'assembled') {
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
    if (err instanceof AgentBudgetError || err instanceof AgentRuntimeError || err instanceof DirectorError) {
      throw err;
    }
    throw new DirectorError(message);
  }
}

async function persistDirector(
  prisma: DirectorStore,
  videoJobId: string,
  data: Record<string, unknown>,
): Promise<void> {
  await prisma.videoJob.update({ where: { id: videoJobId }, data });
}
