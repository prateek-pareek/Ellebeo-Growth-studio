DO $$ BEGIN
  CREATE TYPE "platform"."TemplateFormat" AS ENUM ('carousel', 'reel', 'story', 'caption', 'tiktok');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform"."templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "slug" VARCHAR(255) NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "format" "platform"."TemplateFormat" NOT NULL,
    "pillar" VARCHAR(100),
    "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "goal" VARCHAR(100),
    "description" TEXT,
    "slide_count" INTEGER,
    "zones" JSONB,
    "renderer_key" VARCHAR(255),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "templates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "templates_slug_key" ON "platform"."templates"("slug");
CREATE INDEX IF NOT EXISTS "templates_format_is_active_idx" ON "platform"."templates"("format", "is_active");
CREATE INDEX IF NOT EXISTS "templates_pillar_idx" ON "platform"."templates"("pillar");
