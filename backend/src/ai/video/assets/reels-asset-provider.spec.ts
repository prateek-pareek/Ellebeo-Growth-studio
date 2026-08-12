import { ReelsAssetProvider } from './reels-asset-provider';
import type { AssetProvider } from './asset-provider';

const baseCtx = {
  tenantId: 'tenant-1',
  brandMoodTag: 'elegant',
  brandTone: 'warm_and_friendly',
  medicalAesthetics: false,
};

function makeImageProvider(scenes: { index: number; kind: 'image'; url: string }[]): AssetProvider {
  return { resolveSceneAssets: jest.fn().mockResolvedValue({ scenes }) };
}

describe('ReelsAssetProvider', () => {
  it('returns image-only assets untouched when voiceover is disabled', async () => {
    const imageProvider = makeImageProvider([{ index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg' }]);
    const elevenLabs = { generateVoiceover: jest.fn() };
    const provider = new ReelsAssetProvider(imageProvider, elevenLabs as any);

    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [{ index: 0, headline: 'Hi', caption: null }],
      technicianImageUrls: ['https://cdn.example.com/1.jpg'],
      voiceoverEnabled: false,
    });

    expect(result.voiceover).toBeUndefined();
    expect(elevenLabs.generateVoiceover).not.toHaveBeenCalled();
    expect(result.scenes[0]!.url).toBe('https://cdn.example.com/1.jpg');
  });

  it('generates a voiceover from scene copy and re-times scenes proportional to word count — captions align to VO', async () => {
    const imageProvider = makeImageProvider([
      { index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg' },
      { index: 1, kind: 'image', url: 'https://cdn.example.com/2.jpg' },
    ]);
    const elevenLabs = {
      generateVoiceover: jest.fn().mockResolvedValue({ audioCdnUrl: 'https://cdn.example.com/vo.mp3', durationSeconds: 12 }),
    };
    const provider = new ReelsAssetProvider(imageProvider, elevenLabs as any);

    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [
        { index: 0, headline: 'Short', caption: null },
        { index: 1, headline: 'A much longer scene with many more spoken words here', caption: null },
      ],
      technicianImageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
      voiceoverEnabled: true,
    });

    expect(elevenLabs.generateVoiceover).toHaveBeenCalledTimes(1);
    expect(result.voiceover?.assetUrl).toBe('https://cdn.example.com/vo.mp3');
    expect(result.voiceover?.durationSeconds).toBe(12);
    // The scene with more words gets a longer slice of the measured VO duration.
    expect(result.scenes[1]!.durationSeconds!).toBeGreaterThan(result.scenes[0]!.durationSeconds!);
  });

  it('skips voiceover generation when no scene has any text', async () => {
    const imageProvider = makeImageProvider([{ index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg' }]);
    const elevenLabs = { generateVoiceover: jest.fn() };
    const provider = new ReelsAssetProvider(imageProvider, elevenLabs as any);

    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [{ index: 0, headline: null, caption: null }],
      technicianImageUrls: ['https://cdn.example.com/1.jpg'],
      voiceoverEnabled: true,
    });

    expect(elevenLabs.generateVoiceover).not.toHaveBeenCalled();
    expect(result.voiceover).toBeUndefined();
  });
});
