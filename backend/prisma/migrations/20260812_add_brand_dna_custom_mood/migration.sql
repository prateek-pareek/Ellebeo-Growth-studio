ALTER TYPE "platform"."BrandMood" ADD VALUE IF NOT EXISTS 'CUSTOM';

ALTER TABLE "platform"."brand_dna_profiles" ADD COLUMN IF NOT EXISTS "custom_mood_label" VARCHAR(100);
