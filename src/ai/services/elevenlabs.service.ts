// ============================================================================
// elevenlabs.service.ts — AI Voiceover Generation
// ============================================================================

import fetch from 'node-fetch';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';
import { AI_CONFIG } from '../../config/ai.config';
import type { VoiceoverResult } from '../types/chain-output.types';

export class ElevenLabsService {
  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly s3: S3Client;

  constructor() {
    this.s3 = new S3Client({
      region: process.env['AWS_REGION'] ?? 'us-east-1',
      credentials: {
        accessKeyId: process.env['AWS_ACCESS_KEY_ID'] ?? '',
        secretAccessKey: process.env['AWS_SECRET_ACCESS_KEY'] ?? '',
      },
    });
  }

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

      audioBuffer = await response.buffer();
    } finally {
      clearTimeout(timeout);
    }

    // Upload audio to S3
    const s3Key = `voiceovers/${randomUUID()}.mp3`;
    await this.s3.send(new PutObjectCommand({
      Bucket: process.env['S3_BUCKET_NAME'],
      Key: s3Key,
      Body: audioBuffer,
      ContentType: 'audio/mpeg',
    }));

    const cdnUrl = `https://${process.env['S3_BUCKET_NAME']}.s3.${process.env['AWS_REGION']}.amazonaws.com/${s3Key}`;
    const wordCount = script.split(/\s+/).length;
    const estimatedDuration = Math.ceil(wordCount / 2.5);

    return {
      audioS3Key: s3Key,
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
