import { makeValidVideoPlan } from '../contract/fixture';
import { mapVideoPlanToShotstackEdit, ShotstackEditMapperError } from './shotstack-edit-mapper';

describe('mapVideoPlanToShotstackEdit', () => {
  it('maps a slideshow plan to 9:16 Shotstack JSON with Ken Burns and a callback', () => {
    const plan = makeValidVideoPlan({
      durationSeconds: 8,
      scenes: [
        {
          index: 0,
          durationSeconds: 4,
          asset: { kind: 'IMAGE', assetId: null, url: 'https://cdn.example.com/a.jpg', prompt: null },
          motion: 'KEN_BURNS',
          text: { headline: 'Hook', caption: null, position: 'BOTTOM' },
          transitionOut: 'FADE',
        },
        {
          index: 1,
          durationSeconds: 4,
          asset: { kind: 'IMAGE', assetId: null, url: 'https://cdn.example.com/b.jpg', prompt: null },
          motion: 'KEN_BURNS',
          text: { headline: null, caption: null, position: 'BOTTOM' },
          transitionOut: 'CUT',
        },
      ],
    });

    const edit = mapVideoPlanToShotstackEdit(plan, {
      callbackUrl: 'https://api.example.com/api/v1/video/webhook?token=secret',
    });

    expect(edit.output.aspectRatio).toBe('9:16');
    expect(edit.output.format).toBe('mp4');
    expect(edit.callback).toContain('/api/v1/video/webhook');
    const imageClips = (edit.timeline.tracks[0] as { clips: Array<Record<string, unknown>> }).clips;
    expect(imageClips).toHaveLength(2);
    expect(imageClips[0]!.effect).toBe('zoomIn');
    expect(imageClips[1]!.effect).toBe('zoomOut');
    expect(imageClips[1]!.start).toBe(4);
    expect(JSON.stringify(edit)).toContain('Hook');
  });

  it('rejects scenes without asset URLs', () => {
    expect(() => mapVideoPlanToShotstackEdit(makeValidVideoPlan())).toThrow(ShotstackEditMapperError);
  });

  it('maps reels video clips and burned-in captions aligned to the VO script', () => {
    const script = 'Skin literacy starts with a consult not a promise today';
    const plan = makeValidVideoPlan({
      videoType: 'REELS',
      durationSeconds: 8,
      captions: { enabled: true, style: 'BOLD', burnedIn: true },
      audio: {
        voiceover: {
          enabled: true,
          script,
          voiceId: '21m00Tcm4TlvDq8ikWAM',
          assetUrl: 'https://cdn.example.com/vo.mp3',
        },
        music: { trackId: null, mood: null, volume: 0.3 },
      },
      scenes: [
        {
          index: 0,
          durationSeconds: 4,
          asset: { kind: 'VIDEO', assetId: null, url: 'https://cdn.example.com/clip.mp4', prompt: null },
          motion: 'NONE',
          text: { headline: 'Hook', caption: 'Skin literacy starts with a consult not', position: 'BOTTOM' },
          transitionOut: 'FADE',
        },
        {
          index: 1,
          durationSeconds: 4,
          asset: { kind: 'IMAGE', assetId: null, url: 'https://cdn.example.com/still.jpg', prompt: null },
          motion: 'KEN_BURNS',
          text: { headline: null, caption: 'a promise today', position: 'BOTTOM' },
          transitionOut: 'CUT',
        },
      ],
    });

    const edit = mapVideoPlanToShotstackEdit(plan);
    const visual = (edit.timeline.tracks[0] as { clips: Array<{ asset: { type: string } }> }).clips;
    expect(visual[0]!.asset.type).toBe('video');
    expect(visual[1]!.asset.type).toBe('image');
    expect(JSON.stringify(edit)).toContain('vo.mp3');
    expect(JSON.stringify(edit)).toContain('Skin literacy starts');
    expect(JSON.stringify(edit)).toContain('a promise today');

    const captionTrack = edit.timeline.tracks.find((track) => {
      const clips = (track as { clips: Array<{ start: number; length: number; asset: { html?: string } }> }).clips;
      return clips.some((clip) => clip.asset.html?.includes('Skin literacy starts'));
    }) as { clips: Array<{ start: number; length: number }> };
    expect(captionTrack.clips[0]!.start).toBe(0);
    const last = captionTrack.clips[captionTrack.clips.length - 1]!;
    expect(last.start + last.length).toBeCloseTo(8, 5);
  });
});
