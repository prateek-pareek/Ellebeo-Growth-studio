ALTER TABLE "platform"."brand_dna_profiles" ADD COLUMN IF NOT EXISTS "needs_review" BOOLEAN NOT NULL DEFAULT false;
