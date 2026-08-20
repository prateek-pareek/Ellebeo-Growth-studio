-- Agentic video pipeline (Phase 1) — Video Plan contract tables + enums.
-- Apply with prisma migrate / db push. Existing still/caption flows are untouched.

DO $$ BEGIN
  CREATE TYPE "platform"."VideoType" AS ENUM ('SLIDESHOW', 'REELS', 'AI_CLIPS');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."SceneAssetKind" AS ENUM ('IMAGE', 'VIDEO', 'GENERATED_CLIP', 'STOCK');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."VideoMotion" AS ENUM ('KEN_BURNS', 'NONE', 'SLIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."VideoTransition" AS ENUM ('FADE', 'CUT', 'SLIDE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."VideoStatus" AS ENUM ('DRAFT', 'IN_REVIEW', 'EDITED', 'RENDERING', 'RENDERED', 'PUBLISHED', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."CriticStatus" AS ENUM ('PENDING', 'PASSED', 'FAILED', 'REVISION_REQUESTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."VideoObjective" AS ENUM (
    'PREMIUM_CLIENTS',
    'FILL_QUIET_DAYS',
    'EDUCATE_TRUST',
    'ATTRACT_NEW_CLIENTS',
    'PROMOTE_HIGH_MARGIN',
    'CLIENT_RETENTION',
    'LAUNCH_NEW_SERVICE'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."CaptionStyle" AS ENUM ('BOLD', 'MINIMAL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."TextPosition" AS ENUM ('TOP', 'CENTER', 'BOTTOM');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform"."video_jobs" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "technician_id" UUID NOT NULL,
    "brand_dna_id" UUID NOT NULL,
    "appointment_id" UUID,
    "content_item_id" UUID,
    "video_type" "platform"."VideoType" NOT NULL,
    "status" "platform"."VideoStatus" NOT NULL DEFAULT 'DRAFT',
    "critic_status" "platform"."CriticStatus" NOT NULL DEFAULT 'PENDING',
    "objective" "platform"."VideoObjective" NOT NULL,
    "caption_style" "platform"."CaptionStyle" NOT NULL DEFAULT 'BOLD',
    "primary_asset_kind" "platform"."SceneAssetKind",
    "primary_motion" "platform"."VideoMotion",
    "primary_transition" "platform"."VideoTransition",
    "primary_text_position" "platform"."TextPosition",
    "plan_version" INTEGER NOT NULL DEFAULT 1,
    "plan" JSONB NOT NULL,
    "shotstack_render_id" VARCHAR(255),
    "output_url" VARCHAR(2000),
    "tokens_used" INTEGER NOT NULL DEFAULT 0,
    "estimated_cost_usd" DOUBLE PRECISION,
    "revision_count" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "video_jobs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "video_jobs_tenant_id_status_idx" ON "platform"."video_jobs"("tenant_id", "status");
CREATE INDEX IF NOT EXISTS "video_jobs_tenant_id_created_at_idx" ON "platform"."video_jobs"("tenant_id", "created_at");
CREATE INDEX IF NOT EXISTS "video_jobs_shotstack_render_id_idx" ON "platform"."video_jobs"("shotstack_render_id");
CREATE INDEX IF NOT EXISTS "video_jobs_content_item_id_idx" ON "platform"."video_jobs"("content_item_id");

DO $$ BEGIN
  ALTER TABLE "platform"."video_jobs"
    ADD CONSTRAINT "video_jobs_tenant_id_fkey"
    FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "platform"."video_jobs"
    ADD CONSTRAINT "video_jobs_technician_id_fkey"
    FOREIGN KEY ("technician_id") REFERENCES "platform"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "platform"."video_jobs"
    ADD CONSTRAINT "video_jobs_brand_dna_id_fkey"
    FOREIGN KEY ("brand_dna_id") REFERENCES "platform"."brand_dna"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "platform"."video_jobs"
    ADD CONSTRAINT "video_jobs_appointment_id_fkey"
    FOREIGN KEY ("appointment_id") REFERENCES "platform"."appointments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "platform"."video_jobs"
    ADD CONSTRAINT "video_jobs_content_item_id_fkey"
    FOREIGN KEY ("content_item_id") REFERENCES "platform"."content_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform"."video_plan_revisions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "video_job_id" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "plan" JSONB NOT NULL,
    "critic_score" DOUBLE PRECISION,
    "critic_passed" BOOLEAN,
    "critic_notes" JSONB NOT NULL DEFAULT '[]'::jsonb,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "video_plan_revisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "video_plan_revisions_video_job_id_revision_key"
  ON "platform"."video_plan_revisions"("video_job_id", "revision");
CREATE INDEX IF NOT EXISTS "video_plan_revisions_video_job_id_idx"
  ON "platform"."video_plan_revisions"("video_job_id");

DO $$ BEGIN
  ALTER TABLE "platform"."video_plan_revisions"
    ADD CONSTRAINT "video_plan_revisions_video_job_id_fkey"
    FOREIGN KEY ("video_job_id") REFERENCES "platform"."video_jobs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
