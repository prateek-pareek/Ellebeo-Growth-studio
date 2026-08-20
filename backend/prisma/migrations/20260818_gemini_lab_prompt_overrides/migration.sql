-- Per-tenant overrides for the Gemini Lab creative-director prompt blocks.
-- Nullable and defaulted to NULL so every existing tenant keeps the shipped
-- prompt exactly as it is today; the registry only reads an override when one
-- has actually been written.
ALTER TABLE "platform"."gemini_lab_brand_dna"
  ADD COLUMN IF NOT EXISTS "prompt_overrides" JSONB;
