import { AI_CONFIG } from '../../../config/ai.config';
import { ElevenLabsService } from '../../services/elevenlabs.service';
import type { VoiceoverPort } from './voiceover.port';
export { defaultVoiceId } from './voice-id';

export function createElevenLabsVoiceoverPort(
  service: Pick<ElevenLabsService, 'generateVoiceover'> = new ElevenLabsService(),
): VoiceoverPort {
  return {
    async synthesize({ script, voiceId }) {
      const result = await service.generateVoiceover({
        script,
        voiceId,
        stability: AI_CONFIG.elevenLabs.defaultStability,
        similarityBoost: AI_CONFIG.elevenLabs.defaultSimilarityBoost,
        style: AI_CONFIG.elevenLabs.defaultStyle,
      });
      return {
        assetUrl: result.audioCdnUrl,
        durationSeconds: result.durationSeconds,
        voiceId: result.voiceId,
      };
    },
  };
}
