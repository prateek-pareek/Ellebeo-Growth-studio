import { AI_CONFIG } from '../../../config/ai.config';

export function defaultVoiceId(tone?: string | null): string {
  const voices = AI_CONFIG.elevenLabs.voiceMap;
  if (tone && tone in voices) {
    return voices[tone as keyof typeof voices].voiceId;
  }
  return voices.warm_and_friendly.voiceId;
}
