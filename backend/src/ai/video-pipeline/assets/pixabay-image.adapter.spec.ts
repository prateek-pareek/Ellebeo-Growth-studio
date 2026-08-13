import { createPixabayImageAdapter } from './pixabay-image.adapter';

describe('createPixabayImageAdapter', () => {
  it('maps Pixabay photo hits to vertical stock URLs', async () => {
    const fetchImpl = jest.fn(async () => ({
      ok: true,
      json: async () => ({
        hits: [
          { id: 9, largeImageURL: 'https://pixabay.example/a.jpg', tags: 'spa, marble' },
        ],
      }),
    }));

    const adapter = createPixabayImageAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    const hits = await adapter.search('spa interior', { count: 1, orientation: 'vertical' });
    expect(hits).toEqual([
      { id: '9', url: 'https://pixabay.example/a.jpg', tags: ['spa', 'marble'] },
    ]);
    const calledUrl = String(fetchImpl.mock.calls.at(0)?.at(0) ?? '');
    expect(calledUrl).toContain('orientation=vertical');
    expect(calledUrl).toContain('image_type=photo');
  });

  it('returns no hits when the API key is missing', async () => {
    const fetchImpl = jest.fn() as unknown as typeof fetch;
    const adapter = createPixabayImageAdapter({ apiKey: '', fetchImpl });
    await expect(adapter.search('salon', { count: 2 })).resolves.toEqual([]);
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
