import { GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG } from '../feature-flag';
import { AssetResolveError } from './asset-provider';
import { resolveAiClipAssets } from './ai-clip-assets';
import type { StockImagePort } from './stock-image.port';
import type { VideoClipPort } from './video-clip.port';

function stock(urls: string[]): StockImagePort {
  return {
    search: async (_query, { count }) =>
      urls.slice(0, count).map((url, index) => ({ id: String(index), url, tags: ['salon'] })),
  };
}

function clipPort(gen: (prompt: string) => Promise<string>): VideoClipPort {
  return {
    generate: async ({ prompt }) => ({ url: await gen(prompt), durationSeconds: 6, provider: 'gemini_veo' }),
  };
}

const withAiClipsOn = () => {
  process.env[GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG] = 'true';
};
const withAiClipsOff = () => {
  delete process.env[GROWTH_STUDIO_VIDEO_AI_CLIPS_FLAG];
};

describe('resolveAiClipAssets', () => {
  afterEach(withAiClipsOff);

  it('falls back to stock when the AI-clips flag is off, even if the caller opted in', async () => {
    withAiClipsOff();
    const generate = jest.fn();
    const resolved = await resolveAiClipAssets(
      {
        videoType: 'REELS',
        sceneCount: 1,
        technicianAssets: [],
        medicalAesthetics: false,
        preferAiClips: true,
      },
      { generate },
      stock(['https://stock.example.com/1.jpg']),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(resolved[0]!.kind).toBe('STOCK');
  });

  it('falls back to stock when the caller did not opt in, even if the flag is on', async () => {
    withAiClipsOn();
    const generate = jest.fn();
    const resolved = await resolveAiClipAssets(
      { videoType: 'REELS', sceneCount: 1, technicianAssets: [], medicalAesthetics: false },
      { generate },
      stock(['https://stock.example.com/1.jpg']),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(resolved[0]!.kind).toBe('STOCK');
  });

  it('fills missing scenes with generated clips when opted in and enabled', async () => {
    withAiClipsOn();
    const resolved = await resolveAiClipAssets(
      {
        videoType: 'REELS',
        sceneCount: 2,
        technicianAssets: [{ url: 'https://cdn.example.com/still.jpg' }],
        medicalAesthetics: false,
        preferAiClips: true,
        clipPrompts: ['Slow pan across a lit salon chair'],
      },
      clipPort(async (prompt) => `https://veo.example.com/${encodeURIComponent(prompt)}.mp4`),
      stock([]),
    );
    expect(resolved[0]!.source).toBe('technician');
    expect(resolved[1]!.kind).toBe('GENERATED_CLIP');
    expect(resolved[1]!.source).toBe('ai_clip');
    expect(resolved[1]!.url).toContain('Slow%20pan');
  });

  it('never attempts AI clips for medical-aesthetics brands, regardless of opt-in', async () => {
    withAiClipsOn();
    const generate = jest.fn();
    const resolved = await resolveAiClipAssets(
      {
        videoType: 'REELS',
        sceneCount: 1,
        technicianAssets: [],
        medicalAesthetics: true,
        preferAiClips: true,
      },
      { generate },
      stock(['https://stock.example.com/marble.jpg']),
    );
    expect(generate).not.toHaveBeenCalled();
    expect(resolved[0]!.kind).toBe('STOCK');
  });

  it('falls back to stock for a scene when clip generation fails, without failing the whole reel', async () => {
    withAiClipsOn();
    const resolved = await resolveAiClipAssets(
      { videoType: 'REELS', sceneCount: 1, technicianAssets: [], medicalAesthetics: false, preferAiClips: true },
      { generate: async () => { throw new Error('quota exceeded'); } },
      stock(['https://stock.example.com/fallback.jpg']),
    );
    expect(resolved[0]!.kind).toBe('STOCK');
    expect(resolved[0]!.url).toBe('https://stock.example.com/fallback.jpg');
  });

  it('caps clip generation at maxClipsPerVideo and stocks the rest', async () => {
    withAiClipsOn();
    const generate = jest.fn(async () => ({ url: 'https://veo.example.com/clip.mp4', durationSeconds: 6, provider: 'gemini_veo' }));
    const resolved = await resolveAiClipAssets(
      {
        videoType: 'REELS',
        sceneCount: 6,
        technicianAssets: [],
        medicalAesthetics: false,
        preferAiClips: true,
      },
      { generate },
      stock(['https://stock.example.com/1.jpg', 'https://stock.example.com/2.jpg']),
    );
    // maxClipsPerVideo (4) and costUsdPerClip (0.5) vs maxCostUsdPerVideo (2.0) both cap at 4.
    expect(generate).toHaveBeenCalledTimes(4);
    expect(resolved.filter((a) => a.kind === 'GENERATED_CLIP')).toHaveLength(4);
    expect(resolved.filter((a) => a.kind === 'STOCK')).toHaveLength(2);
  });

  it('throws when stock cannot fill the remaining scenes', async () => {
    withAiClipsOff();
    await expect(
      resolveAiClipAssets(
        { videoType: 'REELS', sceneCount: 2, technicianAssets: [], medicalAesthetics: false },
        { generate: jest.fn() },
        stock([]),
      ),
    ).rejects.toThrow(AssetResolveError);
  });
});
