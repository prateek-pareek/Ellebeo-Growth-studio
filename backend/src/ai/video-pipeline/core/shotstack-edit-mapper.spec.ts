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
});
