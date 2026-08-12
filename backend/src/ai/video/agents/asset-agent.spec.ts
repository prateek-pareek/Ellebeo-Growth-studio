import { runAssetAgent } from './asset-agent';

function makeClient(...calls: any[]) {
  const create = jest.fn();
  calls.forEach((c) => create.mockResolvedValueOnce(c));
  return { beta: { tools: { messages: { create } } } } as any;
}

function toolUse(name: string, input: unknown, id = 'tool_1') {
  return { content: [{ type: 'tool_use', id, name, input }], usage: { input_tokens: 20, output_tokens: 20 } };
}

describe('runAssetAgent', () => {
  it('searches for a stock image then submits the chosen url', async () => {
    const client = makeClient(
      toolUse('search_stock_image', { query: 'modern beauty salon' }, 'tool_1'),
      toolUse('submit_asset_plan', { assets: [{ index: 0, url: 'https://pixabay.com/photo.jpg' }] }, 'tool_2'),
    );
    const search = jest.fn().mockResolvedValue({ id: '1', url: 'https://pixabay.com/photo.jpg', tags: ['salon'] });

    const result = await runAssetAgent({
      scenesNeedingAssets: [{ index: 0, headline: 'Book Today', caption: null }],
      brandMoodTag: 'elegant',
      medicalAesthetics: false,
      client,
      stockImageService: { search } as any,
    });

    expect(search).toHaveBeenCalledWith('modern beauty salon');
    expect(result.output.assets).toEqual([{ index: 0, url: 'https://pixabay.com/photo.jpg' }]);
  });

  it('bounds tool calls relative to the number of gap scenes', async () => {
    const client = makeClient(
      toolUse('search_stock_image', { query: 'a' }, 't1'),
      toolUse('search_stock_image', { query: 'b' }, 't2'),
      toolUse('search_stock_image', { query: 'c' }, 't3'),
    );
    const search = jest.fn().mockResolvedValue(null);

    await expect(
      runAssetAgent({
        scenesNeedingAssets: [{ index: 0, headline: 'x', caption: null }],
        brandMoodTag: null,
        medicalAesthetics: false,
        client,
        stockImageService: { search } as any,
      }),
    ).rejects.toThrow();
  });
});
