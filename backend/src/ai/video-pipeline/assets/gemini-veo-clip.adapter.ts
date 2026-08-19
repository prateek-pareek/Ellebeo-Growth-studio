import { AI_CONFIG } from '../../../config/ai.config';
import { VideoClipGenerationError, type VideoClipPort, type VideoClipRequest } from './video-clip.port';

// Gemini API video generation (Veo) is a long-running operation:
//   POST  models/{model}:predictLongRunning  -> { name: "models/.../operations/..." }
//   GET   {operationName}                    -> polled until done: true
// Mocked in Phase 7 tests. Real key/model not exercised against the live API in
// this phase — same "mocked E2E, real not run" GATE pattern as Shotstack (Phase 2).
interface PredictLongRunningResponse {
  name?: string;
  error?: { message?: string };
}

interface OperationResponse {
  name?: string;
  done?: boolean;
  error?: { message?: string };
  response?: {
    generateVideoResponse?: {
      generatedSamples?: Array<{ video?: { uri?: string } }>;
    };
  };
}

export function createGeminiVeoClipAdapter(opts?: {
  apiKey?: string;
  model?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
}): VideoClipPort {
  const apiKey = opts?.apiKey ?? process.env['GEMINI_API_KEY'] ?? '';
  const model = opts?.model ?? AI_CONFIG.video.aiClips.model;
  const fetchImpl = opts?.fetchImpl ?? fetch;
  const sleepImpl = opts?.sleepImpl ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const { pollIntervalMs, maxPollAttempts, timeoutMs } = AI_CONFIG.video.aiClips;

  return {
    async generate(req: VideoClipRequest) {
      if (!apiKey) {
        throw new VideoClipGenerationError('GEMINI_API_KEY is not configured for AI video clips');
      }

      const instance: Record<string, unknown> = { prompt: req.prompt.trim() };
      if (req.imageUrl) {
        instance['image'] = await imagePart(req.imageUrl, fetchImpl);
      }

      const startRes = await fetchWithTimeout(
        fetchImpl,
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:predictLongRunning?key=${encodeURIComponent(apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            instances: [instance],
            parameters: {
              aspectRatio: req.aspectRatio ?? '9:16',
              durationSeconds: req.durationSeconds ?? AI_CONFIG.video.aiClips.defaultDurationSeconds,
              personGeneration: 'allow_adult',
            },
          }),
        },
        timeoutMs,
      );
      const started = (await startRes.json()) as PredictLongRunningResponse;
      if (!startRes.ok || !started.name) {
        throw new VideoClipGenerationError(
          `Gemini video generation could not start: ${started.error?.message || startRes.statusText}`,
        );
      }

      const operationName = started.name;
      for (let attempt = 0; attempt < maxPollAttempts; attempt++) {
        await sleepImpl(pollIntervalMs);
        const pollRes = await fetchWithTimeout(
          fetchImpl,
          `https://generativelanguage.googleapis.com/v1beta/${operationName}?key=${encodeURIComponent(apiKey)}`,
          {},
          timeoutMs,
        );
        if (!pollRes.ok) continue;
        const op = (await pollRes.json()) as OperationResponse;
        if (!op.done) continue;
        if (op.error) {
          throw new VideoClipGenerationError(`Gemini video generation failed: ${op.error.message || 'unknown error'}`);
        }
        const uri = op.response?.generateVideoResponse?.generatedSamples?.[0]?.video?.uri;
        if (!uri) {
          throw new VideoClipGenerationError('Gemini video generation finished with no video URI');
        }
        return {
          url: uri.includes('key=') ? uri : `${uri}${uri.includes('?') ? '&' : '?'}key=${encodeURIComponent(apiKey)}`,
          durationSeconds: req.durationSeconds ?? AI_CONFIG.video.aiClips.defaultDurationSeconds,
          provider: 'gemini_veo',
        };
      }

      throw new VideoClipGenerationError(
        `Gemini video generation timed out after ${(maxPollAttempts * pollIntervalMs) / 1000}s`,
      );
    },
  };
}

async function imagePart(imageUrl: string, fetchImpl: typeof fetch): Promise<Record<string, string>> {
  const response = await fetchImpl(imageUrl);
  if (!response.ok) {
    throw new VideoClipGenerationError(`Could not fetch reference image: HTTP ${response.status}`);
  }
  const mimeType = response.headers.get('content-type') || 'image/jpeg';
  const buffer = Buffer.from(await response.arrayBuffer());
  return { bytesBase64Encoded: buffer.toString('base64'), mimeType };
}

async function fetchWithTimeout(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  ms: number,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}
