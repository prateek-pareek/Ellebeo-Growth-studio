import { createGeminiVeoClipAdapter } from './gemini-veo-clip.adapter';
import { VideoClipGenerationError } from './video-clip.port';

function jsonResponse(body: unknown, ok = true) {
  return { ok, statusText: ok ? 'OK' : 'Error', json: async () => body } as Response;
}

describe('createGeminiVeoClipAdapter', () => {
  it('starts a long-running operation, polls until done, and returns the video URL', async () => {
    const fetchImpl = jest
      .fn()
      // predictLongRunning
      .mockResolvedValueOnce(jsonResponse({ name: 'models/veo-3.1-fast-generate-preview/operations/abc' }))
      // first poll — not done yet
      .mockResolvedValueOnce(jsonResponse({ done: false }))
      // second poll — done
      .mockResolvedValueOnce(
        jsonResponse({
          done: true,
          response: {
            generateVideoResponse: {
              generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/xyz:download' } }],
            },
          },
        }),
      );

    const adapter = createGeminiVeoClipAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    const clip = await adapter.generate({ prompt: 'Slow pan across a lit salon chair' });

    expect(clip.provider).toBe('gemini_veo');
    expect(clip.url).toContain('key=test-key');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    const startCall = String(fetchImpl.mock.calls[0]?.[0]);
    expect(startCall).toContain(':predictLongRunning');
    const startBody = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));
    expect(startBody.instances[0].prompt).toContain('Slow pan');
  });

  it('base64-encodes a reference image for image-to-video', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array([1, 2, 3]).buffer,
      } as unknown as Response)
      .mockResolvedValueOnce(jsonResponse({ name: 'models/veo/operations/xyz' }))
      .mockResolvedValueOnce(
        jsonResponse({
          done: true,
          response: { generateVideoResponse: { generatedSamples: [{ video: { uri: 'https://cdn.example.com/clip.mp4' } }] } },
        }),
      );

    const adapter = createGeminiVeoClipAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await adapter.generate({ prompt: 'Animate this still', imageUrl: 'https://cdn.example.com/still.jpg' });

    const startBody = JSON.parse(String(fetchImpl.mock.calls[1]?.[1]?.body));
    expect(startBody.instances[0].image.mimeType).toBe('image/png');
    expect(startBody.instances[0].image.bytesBase64Encoded).toBe(Buffer.from([1, 2, 3]).toString('base64'));
  });

  it('throws when GEMINI_API_KEY is not configured', async () => {
    const adapter = createGeminiVeoClipAdapter({ apiKey: '', fetchImpl: jest.fn() as unknown as typeof fetch });
    await expect(adapter.generate({ prompt: 'x' })).rejects.toThrow(VideoClipGenerationError);
  });

  it('throws when the operation reports an error', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: 'models/veo/operations/err' }))
      .mockResolvedValueOnce(jsonResponse({ done: true, error: { message: 'quota exceeded' } }));

    const adapter = createGeminiVeoClipAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(adapter.generate({ prompt: 'x' })).rejects.toThrow(/quota exceeded/);
  });

  it('times out after maxPollAttempts', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(jsonResponse({ name: 'models/veo/operations/slow' }))
      .mockResolvedValue(jsonResponse({ done: false }));

    const adapter = createGeminiVeoClipAdapter({
      apiKey: 'test-key',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sleepImpl: async () => {},
    });

    await expect(adapter.generate({ prompt: 'x' })).rejects.toThrow(/timed out/);
  }, 10_000);
});
