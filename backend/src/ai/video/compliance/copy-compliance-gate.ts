// ============================================================================
// copy-compliance-gate.ts — the code-enforced (no LLM) hard gate on scene
// copy. Reuses the platform's existing AHPRA-aware moderation
// (OutputValidator, already the single source of truth for
// guaranteed-results/medical-claim/body-shame terms in the main content
// pipeline) rather than inventing a second, different blocklist for video.
// Runs unconditionally on every video's scene copy — this mirrors how
// OutputValidator is already applied to every caption regardless of brand
// type in generation-orchestrator.ts, not just medical-aesthetics brands —
// medical-claim/guaranteed-results language is risky copy for any brand.
// Applied *after* the critic loop, right before the plan is finalized, so
// nothing the agents wrote reaches the technician (or a render) unfiltered.
// ============================================================================

import { OutputValidator } from '../../guards/output-validator';
import type { SceneCopy } from '../assets/asset-provider';

export interface CopyComplianceViolation {
  index: number;
  field: 'headline' | 'caption';
  reasons: string[];
}

export interface CopyComplianceResult {
  sceneCopy: SceneCopy[];
  violations: CopyComplianceViolation[];
}

const PLACEHOLDER_CONSENT_RECORD = { id: 'n/a', clientId: 'n/a', tenantId: 'n/a', status: 'granted', allowUseName: true } as const;

export async function filterSceneCopyForCompliance(
  sceneCopy: SceneCopy[],
  outputValidator: OutputValidator = new OutputValidator(),
): Promise<CopyComplianceResult> {
  const violations: CopyComplianceViolation[] = [];
  const filtered: SceneCopy[] = [];

  for (const scene of sceneCopy) {
    let headline = scene.headline;
    let caption = scene.caption;

    if (headline) {
      const result = await outputValidator.validate(headline, PLACEHOLDER_CONSENT_RECORD as any, 'general', 'n/a');
      if (!result.passed) {
        violations.push({ index: scene.index, field: 'headline', reasons: result.hardFailures });
        headline = null;
      }
    }

    if (caption) {
      const result = await outputValidator.validate(caption, PLACEHOLDER_CONSENT_RECORD as any, 'general', 'n/a');
      if (!result.passed) {
        violations.push({ index: scene.index, field: 'caption', reasons: result.hardFailures });
        caption = null;
      }
    }

    filtered.push({ index: scene.index, headline, caption });
  }

  return { sceneCopy: filtered, violations };
}
