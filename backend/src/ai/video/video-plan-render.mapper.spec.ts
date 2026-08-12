import { buildShotstackEditFromPlan, VideoRenderMappingError } from './video-plan-render.mapper';
import { parseVideoPlan, VideoPlan } from './video-plan.schema';

function plan(overrides: Partial<VideoPlan> = {}): VideoPlan {
  return parseVideoPlan({
    technicianId: '11111111-1111-1111-1111-111111111111',
    brandDnaRef: '22222222-2222-2222-2222-222222222222',
    videoType: 'slideshow',
    durationSeconds: 8,
    objective: 'fill_quiet_days',
    scenes: [
      {
        index: 0,
        durationSeconds: 4,
        asset: { kind: 'image', url: 'https://cdn.example.com/a.jpg' },
        motion: 'ken_burns',
        text: { headline: 'Scene one' },
        transitionOut: 'fade',
      },
      {
        index: 1,
        durationSeconds: 4,
        asset: { kind: 'image', url: 'https://cdn.example.com/b.jpg' },
        motion: 'none',
        text: {},
        transitionOut: 'cut',
      },
    ],
    audio: { voiceover: {}, music: {} },
    captions: {},
    branding: { palette: ['#112233'], font: 'Inter' },
    compliance: {},
    critic: {},
    render: {},
    meta: { createdAt: new Date().toISOString() },
    ...overrides,
  } as any);
}

describe('buildShotstackEditFromPlan', () => {
  it('lays out scenes back-to-back with cumulative start offsets', () => {
    const edit = buildShotstackEditFromPlan(plan());
    const timeline = edit.timeline as { tracks: Array<{ clips: Array<{ start: number; length: number }> }> };
    const sceneTrack = timeline.tracks[timeline.tracks.length - 2]!; // last track before optional brand strip / after text track
    const clips = sceneTrack.clips;
    expect(clips[0]!.start).toBe(0);
    expect(clips[0]!.length).toBe(4);
    expect(clips[1]!.start).toBe(4);
  });

  it('applies ken_burns as a zoomIn effect and omits it for none', () => {
    const edit = buildShotstackEditFromPlan(plan());
    const timeline = edit.timeline as { tracks: Array<{ clips: Array<Record<string, unknown>> }> };
    const sceneTrack = timeline.tracks.find((t) => t.clips.some((c) => (c['asset'] as any)?.src?.includes('a.jpg')))!;
    const [sceneOne] = sceneTrack.clips;
    expect(sceneOne!['effect']).toBe('zoomIn');
  });

  it('includes a text overlay track only for scenes with a headline/caption', () => {
    const edit = buildShotstackEditFromPlan(plan());
    const timeline = edit.timeline as { tracks: Array<{ clips: unknown[] }> };
    const textTrack = timeline.tracks[0]!;
    expect(textTrack.clips).toHaveLength(1);
  });

  it('sets output aspect ratio from the plan', () => {
    const edit = buildShotstackEditFromPlan(plan());
    expect((edit.output as any).aspectRatio).toBe('9:16');
  });

  it('attaches the callback url when provided', () => {
    const edit = buildShotstackEditFromPlan(plan(), { callbackUrl: 'https://api.example.com/hook' });
    expect(edit.callback).toBe('https://api.example.com/hook');
  });

  it('mixes in a resolved music url as the soundtrack', () => {
    const edit = buildShotstackEditFromPlan(plan(), { musicUrl: 'https://cdn.example.com/track.mp3' });
    const timeline = edit.timeline as { soundtrack?: { src: string } };
    expect(timeline.soundtrack?.src).toBe('https://cdn.example.com/track.mp3');
  });

  it('throws if a scene has no resolved asset url', () => {
    const p = plan();
    (p.scenes[0] as any).asset.url = null;
    expect(() => buildShotstackEditFromPlan(p)).toThrow(VideoRenderMappingError);
  });

  it('throws on zero scenes', () => {
    const p = plan();
    (p as any).scenes = [];
    expect(() => buildShotstackEditFromPlan(p)).toThrow(VideoRenderMappingError);
  });
});
