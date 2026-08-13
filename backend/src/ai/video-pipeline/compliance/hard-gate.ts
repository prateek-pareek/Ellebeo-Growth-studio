import type { ResolvedSceneAsset } from '../assets/asset-provider';
import type { VideoPlan } from '../contract';
import {
  BODY_SHAME_PHRASES,
  GUARANTEED_RESULTS_PHRASES,
  MEDICAL_BEFORE_AFTER_PHRASES,
  MEDICAL_CLAIM_PHRASES,
  MEDICAL_TESTIMONIAL_PHRASES,
  MEDICAL_URGENCY_PHRASES,
  containsBannedPhrase,
} from './terms';

export class ComplianceHardGateError extends Error {
  constructor(
    message: string,
    readonly failures: string[],
  ) {
    super(message);
    this.name = 'ComplianceHardGateError';
  }
}

export interface HardGateResult {
  passed: boolean;
  failures: string[];
}

export function collectPlanCopy(plan: VideoPlan): string {
  return [
    ...plan.scenes.map((scene) => scene.text.headline),
    ...plan.scenes.map((scene) => scene.text.caption),
    ...plan.scenes.map((scene) => scene.asset.prompt),
    plan.audio.voiceover.script,
  ]
    .filter((value): value is string => Boolean(value && value.trim()))
    .join('\n');
}

export function evaluateVideoPlanHardGate(plan: VideoPlan): HardGateResult {
  const failures: string[] = [];
  const copy = collectPlanCopy(plan);

  pushPhraseFailure(failures, copy, GUARANTEED_RESULTS_PHRASES, 'Prohibited guaranteed-results language');
  pushPhraseFailure(failures, copy, MEDICAL_CLAIM_PHRASES, 'Medical claim language');
  pushPhraseFailure(failures, copy, BODY_SHAME_PHRASES, 'Body-shaming language');

  if (plan.compliance.medicalAesthetics) {
    pushPhraseFailure(failures, copy, MEDICAL_BEFORE_AFTER_PHRASES, 'AHPRA before/after or transformation claim');
    pushPhraseFailure(failures, copy, MEDICAL_URGENCY_PHRASES, 'AHPRA urgency / booking bait');
    pushPhraseFailure(failures, copy, MEDICAL_TESTIMONIAL_PHRASES, 'AHPRA testimonial language');

    for (const scene of plan.scenes) {
      if (scene.asset.kind === 'GENERATED_CLIP') {
        failures.push(
          `Scene ${scene.index}: generated clips are blocked for medical-aesthetics brands`,
        );
      }
    }
  }

  return { passed: failures.length === 0, failures };
}

export function assertVideoPlanHardGate(plan: VideoPlan): void {
  const result = evaluateVideoPlanHardGate(plan);
  if (!result.passed) {
    throw new ComplianceHardGateError(
      `Compliance hard gate failed: ${result.failures.join('; ')}`,
      result.failures,
    );
  }
}

export function assertResolvedAssetsHardGate(
  assets: ResolvedSceneAsset[],
  medicalAesthetics: boolean,
): void {
  if (!medicalAesthetics) return;
  const failures = assets.flatMap((asset, index) => {
    if (asset.kind === 'GENERATED_CLIP') {
      return [`Scene ${index}: generated clips are blocked for medical-aesthetics brands`];
    }
    return [];
  });
  if (failures.length > 0) {
    throw new ComplianceHardGateError(
      `Compliance hard gate failed: ${failures.join('; ')}`,
      failures,
    );
  }
}

function pushPhraseFailure(
  failures: string[],
  copy: string,
  phrases: readonly string[],
  label: string,
): void {
  const hit = containsBannedPhrase(copy, phrases);
  if (hit) failures.push(`${label}: "${hit}"`);
}
