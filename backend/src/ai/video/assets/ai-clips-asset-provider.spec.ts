import { AiClipsAssetProvider, AiClipsCostCeilingError, AiClipsRateLimitError } from './ai-clips-asset-provider';
import type { VideoClipProvider, GenerateClipParams, GeneratedClip } from '../clips/video-clip-provider';

const baseCtx = {
  tenantId: 'tenant-1',
  technicianImageUrls: [],
  brandMoodTag: 'elegant',
  brandTone: null,
  medicalAesthetics: false,
  voiceoverEnabled: false,
};

function makeFakeProvider(costUsdPerScene: number): VideoClipProvider {
  return {
    generateClip: jest.fn(async (params: GenerateClipParams): Promise<GeneratedClip> => ({
      url: `https://runway.example.com/${params.prompt.slice(0, 5)}.mp4`,
      durationSeconds: params.durationSeconds,
      costUsd: costUsdPerScene,
    })),
  };
}

describe('AiClipsAssetProvider', () => {
  it('generates a clip per scene using the injected VideoClipProvider — provider is swappable via the interface', async () => {
    const fakeProvider = makeFakeProvider(0.5);
    const provider = new AiClipsAssetProvider(fakeProvider, 10, 6);

    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [{ index: 0, headline: 'Glow Up', caption: null }, { index: 1, headline: 'Book Today', caption: null }],
    });

    expect(fakeProvider.generateClip).toHaveBeenCalledTimes(2);
    expect(result.scenes).toHaveLength(2);
    expect(result.scenes[0]!.kind).toBe('generated_clip');
  });

  it('builds the prompt from scene caption/headline and brand mood, and excludes real people/medical language', async () => {
    const fakeProvider = makeFakeProvider(0.5);
    const provider = new AiClipsAssetProvider(fakeProvider, 10, 6);

    await provider.resolveSceneAssets({
      ...baseCtx,
      brandMoodTag: 'luxury',
      sceneCopy: [{ index: 0, headline: 'Glow Up', caption: 'Radiant skin' }],
    });

    const promptUsed = (fakeProvider.generateClip as jest.Mock).mock.calls[0][0].prompt;
    expect(promptUsed).toContain('Radiant skin');
    expect(promptUsed).toContain('luxury');
    expect(promptUsed.toLowerCase()).toContain('no real people');
  });

  it('enforces the per-video cost ceiling — throws before exceeding it', async () => {
    const fakeProvider = makeFakeProvider(4);
    // Ceiling of $10, 3 scenes at $4 each -> 3rd scene would bring total to $12, over ceiling.
    const provider = new AiClipsAssetProvider(fakeProvider, 10, 6);

    await expect(
      provider.resolveSceneAssets({
        ...baseCtx,
        sceneCopy: [
          { index: 0, headline: 'A', caption: null },
          { index: 1, headline: 'B', caption: null },
          { index: 2, headline: 'C', caption: null },
        ],
      }),
    ).rejects.toThrow(AiClipsCostCeilingError);
  });

  it('enforces the per-video scene-count rate limit before generating anything', async () => {
    const fakeProvider = makeFakeProvider(0.1);
    const provider = new AiClipsAssetProvider(fakeProvider, 100, 2);

    await expect(
      provider.resolveSceneAssets({
        ...baseCtx,
        sceneCopy: [
          { index: 0, headline: 'A', caption: null },
          { index: 1, headline: 'B', caption: null },
          { index: 2, headline: 'C', caption: null },
        ],
      }),
    ).rejects.toThrow(AiClipsRateLimitError);
    expect(fakeProvider.generateClip).not.toHaveBeenCalled();
  });
});
