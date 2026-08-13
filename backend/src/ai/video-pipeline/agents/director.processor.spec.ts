import { alignCaptionsToVoiceover } from '../assets/caption-timing';
import { createStudioAssetProvider } from '../assets/studio-assets';
import type { VoiceoverPort } from '../assets/voiceover.port';
import { ComplianceHardGateError } from '../compliance/hard-gate';
import { parseVideoPlan } from '../contract';
import { VIDEO_PLAN_FIXTURE_BRAND_DNA_ID, VIDEO_PLAN_FIXTURE_TECHNICIAN_ID } from '../contract/fixture';
import { buildReelsPlan } from '../core/reels-plan-builder';
import { mapVideoPlanToShotstackEdit } from '../core/shotstack-edit-mapper';
import { buildSlideshowPlan } from '../core/slideshow-plan-builder';
import { processVideoRenderJob } from '../core/video-render.processor';
import type { CriticVerdict } from './critic.schema';
import type { LlmPort } from './llm-port';
import {
  applyScriptDraftToPlan,
  parseLoopState,
  processDirectorJob,
  type DirectorJobRecord,
  type DirectorLoopState,
} from './director.processor';
import type { ScriptDraft } from './script.schema';

const scriptDraft: ScriptDraft = {
  hook: 'Glow, not guesswork',
  scenes: [
    { index: 0, headline: 'Glow, not guesswork', caption: 'Education first', position: 'BOTTOM' },
    { index: 1, headline: 'Consult when you are ready', caption: null, position: 'BOTTOM' },
  ],
  voiceoverScript: null,
};

function seedPlan() {
  return parseVideoPlan(
    buildSlideshowPlan({
      technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
      brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
      objective: 'EDUCATE_TRUST',
      images: [
        { url: 'https://cdn.example.com/a.jpg' },
        { url: 'https://cdn.example.com/b.jpg' },
      ],
      branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
      medicalAesthetics: false,
      createdAt: '2026-08-13T00:00:00.000Z',
    }),
  );
}

function createStore(seed: DirectorJobRecord) {
  const rows = new Map<string, DirectorJobRecord>([[seed.id, { ...seed }]]);
  const revisions: Array<Record<string, unknown>> = [];
  const prisma = {
    videoJob: {
      findUnique: async ({ where }: { where: { id: string } }) => rows.get(where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const next = { ...rows.get(where.id)!, ...data } as DirectorJobRecord;
        rows.set(where.id, next);
        return next;
      },
    },
    videoPlanRevision: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        revisions.push(data);
        return data;
      },
    },
  };
  return { prisma, rows, revisions };
}

function seedJob(overrides: Partial<DirectorJobRecord> = {}): DirectorJobRecord {
  const plan = seedPlan();
  return {
    id: '11111111-1111-1111-1111-111111111111',
    tenantId: '22222222-2222-2222-2222-222222222222',
    status: plan.status,
    plan,
    tokensUsed: 0,
    estimatedCostUsd: null,
    revisionCount: 0,
    loopState: {
      step: 'created',
      tokensUsed: 0,
      costUsd: 0,
      toolCalls: 0,
      repaired: false,
      brandVoice: 'Warm, clinical-calm.',
    } satisfies DirectorLoopState,
    ...overrides,
  };
}

const passingCritique: CriticVerdict = {
  hook: 20,
  clarity: 16,
  brandVoice: 12,
  pacing: 8,
  objectiveFit: 12,
  compliance: 12,
  notes: ['Hook is specific.'],
};

const weakCritique: CriticVerdict = {
  hook: 6,
  clarity: 6,
  brandVoice: 6,
  pacing: 4,
  objectiveFit: 6,
  compliance: 8,
  notes: ['Hook is generic. Name a real treatment moment.'],
};

function pipelineLlm(opts?: {
  script?: ScriptDraft;
  critiques?: CriticVerdict[];
}): LlmPort {
  const critiques = opts?.critiques ?? [passingCritique];
  let critiqueIndex = 0;
  let scriptCalls = 0;
  return {
    messagesCreate: async (req) => {
      if (req.tools.some((tool) => tool.name === 'submit_critique')) {
        const input = critiques[Math.min(critiqueIndex, critiques.length - 1)]!;
        critiqueIndex += 1;
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 20, outputTokens: 40 },
          content: [{ type: 'tool_use', id: `c${critiqueIndex}`, name: 'submit_critique', input }],
        };
      }
      scriptCalls += 1;
      const draft = opts?.script ?? scriptDraft;
      return {
        stopReason: 'tool_use',
        usage: { inputTokens: 50, outputTokens: 90 },
        content: [{ type: 'tool_use', id: `s${scriptCalls}`, name: 'submit_script', input: draft }],
      };
    },
  };
}

function scriptLlm(): LlmPort {
  return pipelineLlm();
}

describe('processDirectorJob', () => {
  it('Director + Script produce a schema-valid slideshow plan the Phase 2 core can render', async () => {
    const job = seedJob();
    const { prisma, rows, revisions } = createStore(job);
    const enqueueRender = jest.fn(async () => undefined);
    const persisted: string[] = [];
    const wrapped = {
      ...prisma,
      videoJob: {
        ...prisma.videoJob,
        update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
          const step = (args.data['loopState'] as DirectorLoopState | undefined)?.step;
          if (step) persisted.push(step);
          return prisma.videoJob.update(args);
        },
      },
    };

    const result = await processDirectorJob(
      { prisma: wrapped, llm: scriptLlm(), enqueueRender, isEnabled: () => true },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    expect(result.step).toBe('render_queued');
    expect(persisted).toEqual(['scripted', 'assembled', 'assembled', 'reviewed', 'render_queued']);
    expect(enqueueRender).toHaveBeenCalledWith(job.id, job.tenantId);
    expect(revisions).toHaveLength(1);

    const assembled = parseVideoPlan(rows.get(job.id)!.plan);
    expect(assembled.critic.passed).toBe(true);
    expect(assembled.critic.score).toBeGreaterThanOrEqual(70);
    expect(assembled.meta.source).toBe('agentic_v1');
    expect(assembled.scenes[0].text.headline).toBe('Glow, not guesswork');
    expect(assembled.scenes[1].text.headline).toBe('Consult when you are ready');

    const edit = mapVideoPlanToShotstackEdit(assembled, {
      callbackUrl: 'https://api.example.com/api/v1/video/webhook?token=secret',
    });
    expect(JSON.stringify(edit)).toContain('9:16');
    expect(JSON.stringify(edit)).toContain('Glow, not guesswork');

    const submitted = await processVideoRenderJob(
      {
        prisma: {
          videoJob: {
            findUnique: async () => ({
              id: job.id,
              tenantId: job.tenantId,
              status: assembled.status,
              plan: assembled,
              shotstackRenderId: null,
              outputUrl: null,
              contentItemId: null,
            }),
            update: async () => undefined,
          },
        },
        shotstack: { submitRender: async () => 'render-from-agent' },
        callbackUrl: 'https://api.example.com/api/v1/video/webhook?token=secret',
        isEnabled: () => true,
      },
      { videoJobId: job.id, tenantId: job.tenantId },
    );
    expect(submitted.renderId).toBe('render-from-agent');
  });

  it('resumes from a persisted script draft without calling Script again', async () => {
    const job = seedJob({
      loopState: {
        step: 'scripted',
        scriptDraft,
        tokensUsed: 12,
        costUsd: 0.01,
        toolCalls: 1,
        repaired: false,
      },
    });
    const { prisma } = createStore(job);
    let scriptCalls = 0;
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        if (req.tools.some((tool) => tool.name === 'submit_critique')) {
          return {
            stopReason: 'tool_use',
            usage: { inputTokens: 10, outputTokens: 20 },
            content: [{ type: 'tool_use', id: 'c1', name: 'submit_critique', input: passingCritique }],
          };
        }
        scriptCalls += 1;
        throw new Error('Script should not run on resume');
      },
    };

    const result = await processDirectorJob(
      { prisma, llm, isEnabled: () => true },
      { videoJobId: job.id, tenantId: job.tenantId },
    );
    expect(result.step).toBe('render_queued');
    expect(scriptCalls).toBe(0);
  });

  it('honours the per-video cost ceiling before Script runs', async () => {
    const job = seedJob();
    const { prisma, rows } = createStore(job);
    await expect(
      processDirectorJob(
        {
          prisma,
          llm: scriptLlm(),
          isEnabled: () => true,
          budget: { costUsd: 1, maxCostUsd: 0.25 },
        },
        { videoJobId: job.id, tenantId: job.tenantId },
      ),
    ).rejects.toThrow('cost ceiling');
    expect(parseLoopState(rows.get(job.id)!.loopState).step).toBe('failed');
  });

  it('fills missing slideshow scenes from stock before Script runs', async () => {
    const plan = parseVideoPlan(
      buildSlideshowPlan({
        technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
        brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
        objective: 'EDUCATE_TRUST',
        images: [{ url: 'https://cdn.example.com/a.jpg' }],
        branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
        medicalAesthetics: false,
        createdAt: '2026-08-13T00:00:00.000Z',
      }),
    );
    const job = seedJob({
      plan,
      loopState: {
        step: 'created',
        tokensUsed: 0,
        costUsd: 0,
        toolCalls: 0,
        repaired: false,
        requestedSceneCount: 3,
      },
    });
    const { prisma, rows } = createStore(job);
    const search = jest.fn(async () => [
      { id: '1', url: 'https://stock.example.com/1.jpg', tags: ['spa'] },
      { id: '2', url: 'https://stock.example.com/2.jpg', tags: ['linen'] },
    ]);
    const threeSceneScript = {
      hook: 'Glow, not guesswork',
      scenes: [
        { index: 0, headline: 'Glow, not guesswork', caption: 'Education first', position: 'BOTTOM' as const },
        { index: 1, headline: 'Texture, not trend', caption: null, position: 'BOTTOM' as const },
        { index: 2, headline: 'Consult when you are ready', caption: null, position: 'BOTTOM' as const },
      ],
      voiceoverScript: null,
    };
    const llm = pipelineLlm({ script: threeSceneScript });

    await processDirectorJob(
      {
        prisma,
        llm,
        isEnabled: () => true,
        assetProvider: createStudioAssetProvider({ search }),
      },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    expect(search).toHaveBeenCalled();
    const assembled = parseVideoPlan(rows.get(job.id)!.plan);
    expect(assembled.scenes).toHaveLength(3);
    expect(assembled.scenes[0]!.asset.url).toBe('https://cdn.example.com/a.jpg');
    expect(assembled.scenes[1]!.asset.kind).toBe('STOCK');
    expect(assembled.scenes[2]!.asset.url).toBe('https://stock.example.com/2.jpg');
  });

  it('Reels E2E: VO + burned-in captions align and the Phase 2 core can render', async () => {
    const voScript = 'Skin literacy starts with a consult not a promise today';
    const plan = parseVideoPlan(
      buildReelsPlan({
        technicianId: VIDEO_PLAN_FIXTURE_TECHNICIAN_ID,
        brandDnaRef: VIDEO_PLAN_FIXTURE_BRAND_DNA_ID,
        objective: 'EDUCATE_TRUST',
        assets: [
          { url: 'https://cdn.example.com/clip.mp4', kind: 'VIDEO' },
          { url: 'https://cdn.example.com/still.jpg', kind: 'IMAGE' },
        ],
        branding: { logoAssetId: null, palette: ['#C4A484'], font: 'Montserrat' },
        medicalAesthetics: false,
        createdAt: '2026-08-13T00:00:00.000Z',
      }),
    );
    const job = seedJob({ plan });
    const { prisma, rows } = createStore(job);
    const reelsScript = {
      hook: 'Glow, not guesswork',
      scenes: [
        { index: 0, headline: 'Glow, not guesswork', caption: null, position: 'BOTTOM' as const },
        { index: 1, headline: 'Consult when you are ready', caption: null, position: 'BOTTOM' as const },
      ],
      voiceoverScript: voScript,
    };
    const llm = pipelineLlm({ script: reelsScript });
    const voiceover: VoiceoverPort = {
      synthesize: async ({ script }) => ({
        assetUrl: 'https://cdn.example.com/vo.mp3',
        durationSeconds: 8,
        voiceId: '21m00Tcm4TlvDq8ikWAM',
        script,
      }),
    };

    await processDirectorJob(
      { prisma, llm, voiceover, isEnabled: () => true },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    const assembled = parseVideoPlan(rows.get(job.id)!.plan);
    expect(assembled.videoType).toBe('REELS');
    expect(assembled.audio.voiceover.enabled).toBe(true);
    expect(assembled.audio.voiceover.assetUrl).toContain('vo.mp3');
    expect(assembled.durationSeconds).toBe(8);
    expect(assembled.captions.burnedIn).toBe(true);

    const cues = alignCaptionsToVoiceover(voScript, assembled.durationSeconds);
    const scene0End = assembled.scenes[0]!.durationSeconds;
    expect(assembled.scenes[0]!.text.caption).toContain(cues[0]!.text.split(' ')[0]!);

    const edit = mapVideoPlanToShotstackEdit(assembled);
    expect(JSON.stringify(edit)).toContain('vo.mp3');
    expect(JSON.stringify(edit)).toContain(cues[0]!.text);
    const visual = (edit.timeline.tracks[0] as { clips: Array<{ asset: { type: string } }> }).clips;
    expect(visual[0]!.asset.type).toBe('video');

    const submitted = await processVideoRenderJob(
      {
        prisma: {
          videoJob: {
            findUnique: async () => ({
              id: job.id,
              tenantId: job.tenantId,
              status: assembled.status,
              plan: assembled,
              shotstackRenderId: null,
              outputUrl: null,
              contentItemId: null,
            }),
            update: async () => undefined,
          },
        },
        shotstack: { submitRender: async () => 'reels-render' },
        isEnabled: () => true,
      },
      { videoJobId: job.id, tenantId: job.tenantId },
    );
    expect(submitted.renderId).toBe('reels-render');
    expect(scene0End).toBeGreaterThan(0);
  });

  it('revises a weak draft then passes, and never exceeds N revises', async () => {
    const job = seedJob();
    const { prisma, rows, revisions } = createStore(job);
    let scriptCalls = 0;
    let criticCalls = 0;
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        if (req.tools.some((tool) => tool.name === 'submit_critique')) {
          criticCalls += 1;
          const input = criticCalls === 1 ? weakCritique : passingCritique;
          return {
            stopReason: 'tool_use',
            usage: { inputTokens: 20, outputTokens: 40 },
            content: [{ type: 'tool_use', id: `c${criticCalls}`, name: 'submit_critique', input }],
          };
        }
        scriptCalls += 1;
        expect(req.system).toContain(scriptCalls === 1 ? 'submit_script' : 'CRITIC REJECTED');
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 40, outputTokens: 80 },
          content: [{ type: 'tool_use', id: `s${scriptCalls}`, name: 'submit_script', input: scriptDraft }],
        };
      },
    };

    await processDirectorJob(
      { prisma, llm, isEnabled: () => true, maxCriticRevisions: 2 },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    expect(scriptCalls).toBe(2);
    expect(criticCalls).toBe(2);
    const plan = parseVideoPlan(rows.get(job.id)!.plan);
    expect(plan.critic.passed).toBe(true);
    expect(plan.critic.revisions).toBe(1);
    expect(plan.critic.notes[0]).toContain('Hook is specific');
    expect(revisions).toHaveLength(2);
    expect(revisions[0]).toMatchObject({ criticPassed: false });
    expect(revisions[1]).toMatchObject({ criticPassed: true });
  });

  it('stops the critic loop at N even when every draft fails', async () => {
    const job = seedJob();
    const { prisma, rows } = createStore(job);
    let scriptCalls = 0;
    let criticCalls = 0;
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        if (req.tools.some((tool) => tool.name === 'submit_critique')) {
          criticCalls += 1;
          return {
            stopReason: 'tool_use',
            usage: { inputTokens: 10, outputTokens: 20 },
            content: [{ type: 'tool_use', id: `c${criticCalls}`, name: 'submit_critique', input: weakCritique }],
          };
        }
        scriptCalls += 1;
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 10, outputTokens: 20 },
          content: [{ type: 'tool_use', id: `s${scriptCalls}`, name: 'submit_script', input: scriptDraft }],
        };
      },
    };

    await processDirectorJob(
      { prisma, llm, isEnabled: () => true, maxCriticRevisions: 2 },
      { videoJobId: job.id, tenantId: job.tenantId },
    );

    expect(scriptCalls).toBe(3);
    expect(criticCalls).toBe(3);
    const plan = parseVideoPlan(rows.get(job.id)!.plan);
    expect(plan.critic.passed).toBe(false);
    expect(plan.critic.revisions).toBe(2);
    expect(parseLoopState(rows.get(job.id)!.loopState).step).toBe('render_queued');
  });

  it('fails the job when assembled copy trips the compliance hard gate', async () => {
    const banned: ScriptDraft = {
      ...scriptDraft,
      hook: 'Guaranteed glow tonight',
      scenes: [
        { index: 0, headline: 'Guaranteed glow tonight', caption: null, position: 'BOTTOM' },
        { index: 1, headline: 'Consult when you are ready', caption: null, position: 'BOTTOM' },
      ],
    };
    const job = seedJob();
    const { prisma, rows } = createStore(job);
    const enqueueRender = jest.fn(async () => undefined);

    await expect(
      processDirectorJob(
        {
          prisma,
          llm: pipelineLlm({ script: banned }),
          enqueueRender,
          isEnabled: () => true,
        },
        { videoJobId: job.id, tenantId: job.tenantId },
      ),
    ).rejects.toThrow(ComplianceHardGateError);

    expect(enqueueRender).not.toHaveBeenCalled();
    expect(rows.get(job.id)!.status).toBe('FAILED');
  });

  it('lets the compliance agent block an edge-case plan the keyword gate missed', async () => {
    const job = seedJob();
    const { prisma } = createStore(job);
    const enqueueRender = jest.fn(async () => undefined);
    const llm: LlmPort = {
      messagesCreate: async (req) => {
        if (req.tools.some((tool) => tool.name === 'submit_compliance')) {
          return {
            stopReason: 'tool_use',
            usage: { inputTokens: 8, outputTokens: 12 },
            content: [{
              type: 'tool_use',
              id: 'cmp',
              name: 'submit_compliance',
              input: { block: true, notes: ['Implies a promised outcome.'] },
            }],
          };
        }
        if (req.tools.some((tool) => tool.name === 'submit_critique')) {
          return {
            stopReason: 'tool_use',
            usage: { inputTokens: 8, outputTokens: 12 },
            content: [{ type: 'tool_use', id: 'c1', name: 'submit_critique', input: passingCritique }],
          };
        }
        return {
          stopReason: 'tool_use',
          usage: { inputTokens: 8, outputTokens: 12 },
          content: [{ type: 'tool_use', id: 's1', name: 'submit_script', input: scriptDraft }],
        };
      },
    };

    await expect(
      processDirectorJob(
        {
          prisma,
          llm,
          enqueueRender,
          isEnabled: () => true,
          runComplianceAgent: true,
        },
        { videoJobId: job.id, tenantId: job.tenantId },
      ),
    ).rejects.toThrow(ComplianceHardGateError);
    expect(enqueueRender).not.toHaveBeenCalled();
  });
});

describe('applyScriptDraftToPlan', () => {
  it('overlays hook + scene copy and keeps deterministic geometry', () => {
    const plan = applyScriptDraftToPlan(seedPlan(), scriptDraft);
    expect(plan.scenes).toHaveLength(2);
    expect(plan.scenes[0].motion).toBe('KEN_BURNS');
    expect(plan.scenes[0].text.headline).toBe(scriptDraft.hook);
    expect(plan.videoType).toBe('SLIDESHOW');
  });
});
