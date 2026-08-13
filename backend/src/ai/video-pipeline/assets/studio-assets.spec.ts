import { AssetResolveError } from './asset-provider';
import type { StockImagePort } from './stock-image.port';
import { resolveStudioAssets } from './studio-assets';

function stock(urls: string[]): StockImagePort {
  return {
    search: async (_query, { count }) =>
      urls.slice(0, count).map((url, index) => ({ id: String(index), url, tags: ['salon'] })),
  };
}

describe('resolveStudioAssets', () => {
  it('keeps technician images and does not call stock when enough URLs exist', async () => {
    const search = jest.fn(async () => []);
    const resolved = await resolveStudioAssets(
      {
        videoType: 'SLIDESHOW',
        sceneCount: 2,
        technicianAssets: [
          { url: 'https://cdn.example.com/a.jpg' },
          { url: 'https://cdn.example.com/b.jpg' },
        ],
        medicalAesthetics: false,
      },
      { search },
    );
    expect(search).not.toHaveBeenCalled();
    expect(resolved.map((asset) => asset.source)).toEqual(['technician', 'technician']);
  });

  it('fills missing slideshow scenes from the stock adapter', async () => {
    const resolved = await resolveStudioAssets(
      {
        videoType: 'SLIDESHOW',
        sceneCount: 3,
        technicianAssets: [{ url: 'https://cdn.example.com/a.jpg' }],
        medicalAesthetics: false,
      },
      stock(['https://stock.example.com/1.jpg', 'https://stock.example.com/2.jpg']),
    );
    expect(resolved).toHaveLength(3);
    expect(resolved[0]!.source).toBe('technician');
    expect(resolved[1]!.kind).toBe('STOCK');
    expect(resolved[2]!.url).toBe('https://stock.example.com/2.jpg');
  });

  it('preserves technician video clips for reels', async () => {
    const resolved = await resolveStudioAssets(
      {
        videoType: 'REELS',
        sceneCount: 2,
        technicianAssets: [
          { url: 'https://cdn.example.com/clip.mp4', kind: 'VIDEO' },
          { url: 'https://cdn.example.com/still.jpg', kind: 'IMAGE' },
        ],
        medicalAesthetics: false,
      },
      stock([]),
    );
    expect(resolved[0]!.kind).toBe('VIDEO');
    expect(resolved[1]!.kind).toBe('IMAGE');
  });

  it('throws when stock cannot fill remaining scenes', async () => {
    await expect(
      resolveStudioAssets(
        {
          videoType: 'SLIDESHOW',
          sceneCount: 2,
          technicianAssets: [],
          medicalAesthetics: true,
        },
        stock([]),
      ),
    ).rejects.toThrow(AssetResolveError);
  });
});
