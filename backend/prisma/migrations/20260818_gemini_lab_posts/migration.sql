-- Posts the studio decided to keep. Additive and idempotent, so it is safe on a
-- database whose migration history has drifted.
CREATE TABLE IF NOT EXISTS "platform"."gemini_lab_posts" (
  "id"                UUID NOT NULL DEFAULT gen_random_uuid(),
  "tenant_id"         UUID NOT NULL,
  "image_url"         VARCHAR(2000) NOT NULL,
  "format"            VARCHAR(40) NOT NULL,
  "photo_mode"        VARCHAR(32) NOT NULL,
  "template_id"       VARCHAR(120),
  "palette_treatment" VARCHAR(40),
  "type_pairing"      VARCHAR(120),
  "aspect_ratio"      VARCHAR(10) NOT NULL DEFAULT '4:5',
  "headline"          TEXT,
  "caption"           JSONB,
  "scheduled_for"     TIMESTAMPTZ,
  "status"            VARCHAR(20) NOT NULL DEFAULT 'kept',
  "created_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at"        TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "deleted_at"        TIMESTAMPTZ,
  CONSTRAINT "gemini_lab_posts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "gemini_lab_posts_tenant_scheduled"
  ON "platform"."gemini_lab_posts" ("tenant_id", "scheduled_for");
CREATE INDEX IF NOT EXISTS "gemini_lab_posts_tenant_created"
  ON "platform"."gemini_lab_posts" ("tenant_id", "created_at");

DO $$
BEGIN
  ALTER TABLE "platform"."gemini_lab_posts"
    ADD CONSTRAINT "gemini_lab_posts_tenant_fk"
    FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
