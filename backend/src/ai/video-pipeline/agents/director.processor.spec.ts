import { alignCaptionsToVoiceover } from '../assets/caption-timing';
import { createStudioAssetProvider } from '../assets/studio-assets';
import type { VoiceoverPort } from '../assets/voiceover.port';
import { parseVideoPlan } from '../contract';
import { VIDEO_PLAN_FIXTURE_BRAND_DNA_ID, VIDEO_PLAN_FIXTURE_TECHNICIAN_ID } from '../contract/fixture';
import { buildReelsPlan } from '../core/reels-plan-builder';
import { mapVideoPlanToShotstackEdit } from '../core/shotstack-edit-mapper';
import { buildSlideshowPlan } from '../core/slideshow-plan-builder';
import { processVideoRenderJob } from '../core/video-render.processor';
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

function scriptLlm(): LlmPort {
  return {
    messagesCreate: async () => ({
      stopReason: 'tool_use',
      usage: { inputTokens: 50, outputTokens: 90 },
      content: [{ type: 'tool_use', id: 's1', name: 'submit_script', input: scriptDraft }],
    }),
  };
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
    expect(persisted).toEqual(['scripted', 'assembled', 'render_queued']);
    expect(enqueueRender).toHaveBeenCalledWith(job.id, job.tenantId);
    expect(revisions).toHaveLength(1);

    const assembled = parseVideoPlan(rows.get(job.id)!.plan);
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

  it('resumes from a persisted script draft without calling the LLM', async () => {
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
    const llm: LlmPort = {
      messagesCreate: async () => {
        throw new Error('LLM should not run on resume');
      },
    };

    const result = await processDirectorJob(
      { prisma, llm, isEnabled: () => true },
      { videoJobId: job.id, tenantId: job.tenantId },
    );
    expect(result.step).toBe('render_queued');
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
    const llm: LlmPort = {
      messagesCreate: async () => ({
        stopReason: 'tool_use',
        usage: { inputTokens: 20, outputTokens: 40 },
        content: [{ type: 'tool_use', id: 's1', name: 'submit_script', input: threeSceneScript }],
      }),
    };

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
    const llm: LlmPort = {
      messagesCreate: async () => ({
        stopReason: 'tool_use',
        usage: { inputTokens: 30, outputTokens: 60 },
        content: [{ type: 'tool_use', id: 's1', name: 'submit_script', input: reelsScript }],
      }),
    };
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
