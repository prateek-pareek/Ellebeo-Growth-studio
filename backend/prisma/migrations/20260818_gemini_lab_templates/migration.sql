-- Designed post layouts for Gemini Lab, as data rather than code.
--
-- Deliberately a new table rather than a change to "templates": that model
-- carries content taxonomy and no geometry, and is shared with the /generation
-- pipeline. Additive and idempotent, so it is safe to apply to a database whose
-- migration history has drifted.
CREATE TABLE IF NOT EXISTS "platform"."gemini_lab_templates" (
  "id"          UUID NOT NULL DEFAULT gen_random_uuid(),
  "key"         VARCHAR(120) NOT NULL,
  "tenant_id"   UUID,
  "name"        VARCHAR(160) NOT NULL,
  "intent"      TEXT NOT NULL,
  "photo_mode"  VARCHAR(32) NOT NULL,
  "regions"     JSONB NOT NULL,
  "defaults"    JSONB NOT NULL,
  "allows"      JSONB,
  "suits"       TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "source"      VARCHAR(32) NOT NULL DEFAULT 'builtin',
  "version"     INTEGER NOT NULL DEFAULT 1,
  "is_active"   BOOLEAN NOT NULL DEFAULT true,
  "sort_order"  INTEGER NOT NULL DEFAULT 0,
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "gemini_lab_templates_pkey" PRIMARY KEY ("id")
);

-- One key per tenant; the shared library uses a NULL tenant. Postgres treats
-- NULLs as distinct in a unique index, so the partial index below is what
-- actually keeps the shared library's keys unique.
CREATE UNIQUE INDEX IF NOT EXISTS "gemini_lab_templates_tenant_key"
  ON "platform"."gemini_lab_templates" ("tenant_id", "key");
CREATE UNIQUE INDEX IF NOT EXISTS "gemini_lab_templates_global_key"
  ON "platform"."gemini_lab_templates" ("key") WHERE "tenant_id" IS NULL;
CREATE INDEX IF NOT EXISTS "gemini_lab_templates_mode_active"
  ON "platform"."gemini_lab_templates" ("photo_mode", "is_active");

DO $$
BEGIN
  ALTER TABLE "platform"."gemini_lab_templates"
    ADD CONSTRAINT "gemini_lab_templates_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
