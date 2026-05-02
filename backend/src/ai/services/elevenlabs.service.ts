// ============================================================================
// elevenlabs.service.ts — AI Voiceover Generation
// ============================================================================

import { firebaseStorage } from '../../config/firebase.client';
import { randomUUID } from 'crypto';
import { AI_CONFIG } from '../../config/ai.config';
import type { VoiceoverResult } from '../types/chain-output.types';

export class ElevenLabsService {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';

  async generateVoiceover(params: {
    script: string;
    voiceId: string;
    stability: number;
    similarityBoost: number;
    style: number;
  }): Promise<VoiceoverResult> {
    const { script, voiceId, stability, similarityBoost, style } = params;

    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      AI_CONFIG.timeouts.elevenLabs
    );

    let audioBuffer: Buffer;
    try {
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'xi-api-key': process.env['ELEVENLABS_API_KEY'] ?? '',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text: script,
            model_id: 'eleven_multilingual_v2',
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
              use_speaker_boost: true,
            },
          }),
          signal: controller.signal,
        }
      );

      if (!response.ok) {
        const body = await response.text();
        throw new ElevenLabsError(`ElevenLabs failed ${response.status}: ${body}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      audioBuffer = Buffer.from(arrayBuffer);
    } finally {
      clearTimeout(timeout);
    }

    // Upload audio to Firebase Storage
    const storagePath = `voiceovers/${randomUUID()}.mp3`;
    const bucket = firebaseStorage.bucket();
    const file = bucket.file(storagePath);

    await file.save(audioBuffer, {
      metadata: {
        contentType: 'audio/mpeg',
      },
    });

    // Generate a long-lived signed URL or public URL
    // For simplicity in this layer, we construct the public URL format
    // Alternatively, file.getSignedUrl({ action: 'read', expires: '03-09-2491' })
    const cdnUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 2.5);

    return {
      audioStoragePath: storagePath,
      audioCdnUrl: cdnUrl,
      durationSeconds: estimatedDuration,
      voiceId,
      voiceName: this.getVoiceName(voiceId),
    };
  }

  private getVoiceName(voiceId: string): string {
    const voices = AI_CONFIG.elevenLabs.voiceMap;
    for (const [, config] of Object.entries(voices)) {
      if (config.voiceId === voiceId) return config.voiceName;
    }
    return 'Unknown';
  }
}

export class ElevenLabsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ElevenLabsError';
  }
}
