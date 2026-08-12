import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';

// Phase 6 (BRAND_DNA_GUIDED_V2 — /brand_dna_implementation_plan.md §10).
export const BRAND_DNA_EVENT_TYPES = [
  'started', 'step_completed', 'suggestion_accepted', 'suggestion_modified', 'story_skipped', 'completed',
] as const;

export class TrackBrandDnaEventDto {
  @IsString()
  event: (typeof BRAND_DNA_EVENT_TYPES)[number];

  @IsInt()
  @IsOptional()
  step?: number;

  @IsObject()
  @IsOptional()
  metadata?: Record<string, unknown>;
}
