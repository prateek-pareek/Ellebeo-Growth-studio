-- Per-brand creative memory for Gemini Lab: a rolling list of recent
-- composition/style signatures so generation can avoid repeating a look it
-- has just produced. Additive and nullable — no backfill required, existing
-- rows simply have no history yet.

ALTER TABLE "platform"."gemini_lab_brand_dna"
  ADD COLUMN IF NOT EXISTS "recent_looks" JSONB;
