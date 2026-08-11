// Phase 4 (BRAND_DNA_GUIDED_V2 — /brand_dna_implementation_plan.md §7): terms
// hard-failed ONLY for medical-aesthetics practitioners. Shared by
// output-validator.ts (caption text) and scoring-gate.service.ts (pre-judge
// deterministic check) so the two never drift out of sync.
export const MEDICAL_OUTCOME_TERMS = [
  'transformation', 'life-changing', 'life changing', 'dramatic results', 'instant results',
  'see the difference', 'before and after', 'flawless skin', 'erase', 'reverse aging', 'turn back time',
];

export const MEDICAL_URGENCY_TERMS = [
  'book now before', 'limited spots', 'offer ends', "don't miss out", 'last chance', 'hurry', 'act now',
];
