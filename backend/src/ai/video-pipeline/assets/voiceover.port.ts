export interface VoiceoverRequest {
  script: string;
  voiceId: string;
}

export interface VoiceoverAsset {
  assetUrl: string;
  durationSeconds: number;
  voiceId: string;
  script: string;
}

export interface VoiceoverPort {
  synthesize(req: VoiceoverRequest): Promise<Omit<VoiceoverAsset, 'script'>>;
}
