// ============================================================================
// openai-tts.service.ts — OpenAI TTS fallback for ElevenLabs voiceover
// Used when ELEVENLABS_API_KEY is not configured.
// ============================================================================

import OpenAI from 'openai';
import { firebaseStorage } from '../../config/firebase.client';
import { randomUUID } from 'crypto';
import type { VoiceoverResult } from '../types/chain-output.types';

type OpenAiVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

export class OpenAiTtsService {
  private readonly openai = new OpenAI({ apiKey: process.env['OPENAI_API_KEY'] });

  async generateVoiceover(params: {
    script: string;
    voice?: OpenAiVoice;
  }): Promise<VoiceoverResult> {
    const { script, voice = 'nova' } = params;

    const response = await this.openai.audio.speech.create({
      model: 'tts-1',
      voice,
      input: script,
    });

    const arrayBuffer = await response.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);

    if (!firebaseStorage) {
      throw new OpenAiTtsError('Firebase Storage not configured.');
    }

    const storagePath = `voiceovers/${randomUUID()}.mp3`;
    const bucket = firebaseStorage.bucket();
    const file = bucket.file(storagePath);

    await file.save(audioBuffer, {
      metadata: { contentType: 'audio/mpeg' },
    });

    const cdnUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media`;

    const estimatedDuration = Math.ceil(script.split(/\s+/).length / 2.5);

    return {
      audioStoragePath: storagePath,
      audioCdnUrl: cdnUrl,
      durationSeconds: estimatedDuration,
      voiceId: voice,
      voiceName: `openai/${voice}`,
    };
  }
}

export class OpenAiTtsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpenAiTtsError';
  }
}
