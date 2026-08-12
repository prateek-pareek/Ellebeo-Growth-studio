jest.mock('../agents/asset-agent', () => ({
  runAssetAgent: jest.fn(),
}));

import { SlideshowAssetProvider } from './slideshow-asset-provider';
import { runAssetAgent } from '../agents/asset-agent';

const baseCtx = {
  tenantId: 'tenant-1',
  brandMoodTag: 'elegant',
  brandTone: 'warm_and_friendly',
  medicalAesthetics: false,
  voiceoverEnabled: false,
};

describe('SlideshowAssetProvider', () => {
  beforeEach(() => {
    (runAssetAgent as jest.Mock).mockReset();
  });

  it('uses technician images 1:1 when every scene has one — never calls the Asset agent', async () => {
    const provider = new SlideshowAssetProvider();
    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [{ index: 0, headline: 'A', caption: null }, { index: 1, headline: 'B', caption: null }],
      technicianImageUrls: ['https://cdn.example.com/1.jpg', 'https://cdn.example.com/2.jpg'],
    });

    expect(result.scenes).toEqual([
      { index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg' },
      { index: 1, kind: 'image', url: 'https://cdn.example.com/2.jpg' },
    ]);
    expect(runAssetAgent).not.toHaveBeenCalled();
  });

  it('blocks a client-photo-flagged image when medicalAesthetics is true, routing to the Asset agent instead (compliance hard gate)', async () => {
    (runAssetAgent as jest.Mock).mockResolvedValue({ output: { assets: [{ index: 0, url: 'https://pixabay.com/clinic.jpg' }] } });

    const provider = new SlideshowAssetProvider();
    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      medicalAesthetics: true,
      sceneCopy: [{ index: 0, headline: 'Glow Up', caption: null }],
      technicianImageUrls: ['https://cdn.example.com/client-face.jpg'],
      clientPhotoFlags: [true],
    });

    expect(result.scenes).toEqual([{ index: 0, kind: 'stock', url: 'https://pixabay.com/clinic.jpg' }]);
    expect(runAssetAgent).toHaveBeenCalledTimes(1);
  });

  it('uses the technician image untouched when medicalAesthetics is true but it is not flagged as a client photo', async () => {
    const provider = new SlideshowAssetProvider();
    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      medicalAesthetics: true,
      sceneCopy: [{ index: 0, headline: 'Clinic Interior', caption: null }],
      technicianImageUrls: ['https://cdn.example.com/interior.jpg'],
      clientPhotoFlags: [false],
    });

    expect(result.scenes).toEqual([{ index: 0, kind: 'image', url: 'https://cdn.example.com/interior.jpg' }]);
    expect(runAssetAgent).not.toHaveBeenCalled();
  });

  it('fills a gap scene via the Asset agent when no technician image is supplied', async () => {
    (runAssetAgent as jest.Mock).mockResolvedValue({ output: { assets: [{ index: 1, url: 'https://pixabay.com/stock.jpg' }] } });

    const provider = new SlideshowAssetProvider();
    const result = await provider.resolveSceneAssets({
      ...baseCtx,
      sceneCopy: [{ index: 0, headline: 'A', caption: null }, { index: 1, headline: 'B', caption: null }],
      technicianImageUrls: ['https://cdn.example.com/1.jpg'],
    });

    expect(result.scenes).toEqual([
      { index: 0, kind: 'image', url: 'https://cdn.example.com/1.jpg' },
      { index: 1, kind: 'stock', url: 'https://pixabay.com/stock.jpg' },
    ]);
    expect(runAssetAgent).toHaveBeenCalledTimes(1);
  });
});
