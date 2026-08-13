import { parseVideoPlan, type VideoPlan } from '../contract';
import type { ResolvedSceneAsset } from '../assets/asset-provider';
import {
  alignCaptionsToVoiceover,
  captionTextForWindow,
} from '../assets/caption-timing';
import type { VoiceoverAsset } from '../assets/voiceover.port';
import { clampVideoDuration, redistributeSceneDurations } from './reels-plan-builder';

export function applyResolvedAssetsToPlan(
  plan: VideoPlan,
  assets: ResolvedSceneAsset[],
): VideoPlan {
  if (assets.length === 0) return plan;

  const baseScenes = plan.scenes.length > 0 ? plan.scenes : [];
  const template = baseScenes[0] ?? {
    index: 0,
    durationSeconds: plan.durationSeconds,
    asset: { kind: 'IMAGE' as const, assetId: null, url: null, prompt: null },
    motion: 'KEN_BURNS' as const,
    text: { headline: null, caption: null, position: 'BOTTOM' as const },
    transitionOut: 'FADE' as const,
  };

  const durations = redistributeSceneDurations(assets.length, plan.durationSeconds);
  const scenes = assets.map((asset, index) => {
    const previous = baseScenes[index] ?? template;
    const isClip = asset.kind === 'VIDEO' || asset.kind === 'GENERATED_CLIP';
    return {
      ...previous,
      index,
      durationSeconds: durations[index]!,
      asset: {
        kind: asset.kind,
        assetId: asset.assetId,
        url: asset.url,
        prompt: asset.prompt,
      },
      motion: isClip ? 'NONE' as const : previous.motion,
      transitionOut: index === assets.length - 1 ? 'CUT' as const : previous.transitionOut,
    };
  });

  return parseVideoPlan({
    ...plan,
    durationSeconds: durations.reduce((sum, value) => sum + value, 0),
    scenes,
  });
}

export function applyVoiceoverToPlan(plan: VideoPlan, voiceover: VoiceoverAsset): VideoPlan {
  const durationSeconds = clampVideoDuration(voiceover.durationSeconds);
  const durations = redistributeSceneDurations(plan.scenes.length, durationSeconds);
  const cues = alignCaptionsToVoiceover(voiceover.script, durationSeconds);
  let cursor = 0;
  const scenes = plan.scenes.map((scene, index) => {
    const start = cursor;
    const length = durations[index]!;
    cursor += length;
    return {
      ...scene,
      durationSeconds: length,
      text: {
        ...scene.text,
        caption: captionTextForWindow(cues, start, start + length) ?? scene.text.caption,
      },
    };
  });

  return parseVideoPlan({
    ...plan,
    durationSeconds,
    scenes,
    audio: {
      ...plan.audio,
      voiceover: {
        enabled: true,
        script: voiceover.script,
        voiceId: voiceover.voiceId,
        assetUrl: voiceover.assetUrl,
      },
    },
    captions: {
      ...plan.captions,
      enabled: true,
      burnedIn: true,
    },
  });
}
