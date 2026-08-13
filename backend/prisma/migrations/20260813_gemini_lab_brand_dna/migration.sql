-- Gemini Lab–only guided Brand DNA. Production brand_dna /generate are untouched.

CREATE TABLE "platform"."gemini_lab_brand_dna" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "current_step" INTEGER NOT NULL DEFAULT 1,
    "draft" JSONB NOT NULL,
    "profile" JSONB,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "gemini_lab_brand_dna_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "gemini_lab_brand_dna_tenant_id_key" ON "platform"."gemini_lab_brand_dna"("tenant_id");

ALTER TABLE "platform"."gemini_lab_brand_dna"
  ADD CONSTRAINT "gemini_lab_brand_dna_tenant_id_fkey"
  FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
