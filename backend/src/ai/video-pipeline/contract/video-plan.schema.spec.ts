import {
  CaptionStyle,
  CriticStatus,
  SceneAssetKind,
  TextPosition,
  VideoMotion,
  VideoObjective,
  VideoStatus,
  VideoTransition,
  VideoType,
} from '@prisma/client';
import {
  CAPTION_STYLES,
  CRITIC_STATUSES,
  SCENE_ASSET_KINDS,
  TEXT_POSITIONS,
  VIDEO_MOTIONS,
  VIDEO_OBJECTIVES,
  VIDEO_STATUSES,
  VIDEO_TRANSITIONS,
  VIDEO_TYPES,
} from './constants';
import { parseVideoPlan, safeParseVideoPlan, type VideoPlan } from './schema';
import { makeValidVideoPlan } from './fixture';

describe('Video Plan contract', () => {
  it('parses a valid slideshow plan', () => {
    const plan = parseVideoPlan(makeValidVideoPlan());
    expect(plan.planVersion).toBe(1);
    expect(plan.videoType).toBe('SLIDESHOW');
    expect(plan.aspect).toBe('9:16');
    expect(plan.scenes).toHaveLength(1);
    expect(plan.render.provider).toBe('shotstack');
  });

  it('compiles a typed VideoPlan from the schema (no any-cast)', () => {
    const plan: VideoPlan = parseVideoPlan(makeValidVideoPlan({ videoType: 'REELS' }));
    expect(plan.videoType).toBe('REELS');
  });

  describe('rejects off-enum values', () => {
    it.each([
      ['videoType', 'CAROUSEL'],
      ['objective', 'GO_VIRAL'],
      ['status', 'queued'],
      ['aspect', '16:9'],
    ] as const)('%s = %s', (field, value) => {
      const result = safeParseVideoPlan(makeValidVideoPlan({ [field]: value } as Partial<VideoPlan>));
      expect(result.success).toBe(false);
    });

    it('rejects an unknown scene motion', () => {
      const plan = makeValidVideoPlan();
      (plan.scenes[0] as { motion: string }).motion = 'SPIN';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects an unknown transition', () => {
      const plan = makeValidVideoPlan();
      (plan.scenes[0] as { transitionOut: string }).transitionOut = 'WIPE';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects an unknown asset kind', () => {
      const plan = makeValidVideoPlan();
      (plan.scenes[0] as { asset: { kind: string } }).asset.kind = 'GIF';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects an unknown caption style', () => {
      const plan = makeValidVideoPlan();
      (plan.captions as { style: string }).style = 'NEON';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects an unknown text position', () => {
      const plan = makeValidVideoPlan();
      (plan.scenes[0].text as { position: string }).position = 'LEFT';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects an unknown render provider', () => {
      const plan = makeValidVideoPlan();
      (plan.render as { provider: string }).provider = 'runway';
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });

    it('rejects planVersion other than 1', () => {
      const result = safeParseVideoPlan({ ...makeValidVideoPlan(), planVersion: 2 });
      expect(result.success).toBe(false);
    });

    it('rejects a non-uuid technicianId', () => {
      const result = safeParseVideoPlan(makeValidVideoPlan({ technicianId: 'not-a-uuid' }));
      expect(result.success).toBe(false);
    });

    it('rejects an invalid palette hex', () => {
      const plan = makeValidVideoPlan();
      plan.branding.palette = ['blue'];
      expect(safeParseVideoPlan(plan).success).toBe(false);
    });
  });

  describe('Prisma enums stay in lockstep with the Zod contract', () => {
    const assertSameMembers = (zodValues: readonly string[], prismaValues: Record<string, string>) => {
      expect(Object.values(prismaValues).sort()).toEqual([...zodValues].sort());
    };

    it('VideoType', () => assertSameMembers(VIDEO_TYPES, VideoType));
    it('SceneAssetKind', () => assertSameMembers(SCENE_ASSET_KINDS, SceneAssetKind));
    it('VideoMotion', () => assertSameMembers(VIDEO_MOTIONS, VideoMotion));
    it('VideoTransition', () => assertSameMembers(VIDEO_TRANSITIONS, VideoTransition));
    it('VideoStatus', () => assertSameMembers(VIDEO_STATUSES, VideoStatus));
    it('CriticStatus', () => assertSameMembers(CRITIC_STATUSES, CriticStatus));
    it('VideoObjective', () => assertSameMembers(VIDEO_OBJECTIVES, VideoObjective));
    it('CaptionStyle', () => assertSameMembers(CAPTION_STYLES, CaptionStyle));
    it('TextPosition', () => assertSameMembers(TEXT_POSITIONS, TextPosition));
  });
});
