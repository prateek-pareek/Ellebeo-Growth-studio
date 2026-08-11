DO $$ BEGIN
  CREATE TYPE "platform"."BrandMood" AS ENUM ('SOFT_GLAM', 'CLEAN_CLINICAL', 'EDITORIAL_MINIMAL', 'NATURAL_ORGANIC', 'BOLD_LUXE', 'PLAYFUL_FRESH');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."BrandObjective" AS ENUM ('PREMIUM_CLIENTS', 'FILL_QUIET_DAYS', 'EDUCATE_TRUST', 'PROMOTE_BRIDAL', 'LAUNCH_PRODUCT');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."GenderFocus" AS ENUM ('WOMEN', 'MEN', 'ALL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "platform"."LanguageVariant" AS ENUM ('AU', 'UK', 'US');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "platform"."brand_dna_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 2,
    "is_current" BOOLEAN NOT NULL DEFAULT true,

    "brand_name" VARCHAR(255) NOT NULL,
    "logo_asset_id" VARCHAR(500),
    "palette" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "mood" "platform"."BrandMood" NOT NULL,
    "typography_heading" VARCHAR(100),
    "typography_body" VARCHAR(100),
    "essence" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    "service_category" VARCHAR(255) NOT NULL,
    "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "signature_handle" VARCHAR(255),
    "service_areas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    "age_min" INTEGER NOT NULL DEFAULT 18,
    "age_max" INTEGER NOT NULL DEFAULT 65,
    "gender_focus" "platform"."GenderFocus" NOT NULL DEFAULT 'ALL',
    "client_types" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],

    "objective" "platform"."BrandObjective" NOT NULL,
    "posts_per_week" INTEGER NOT NULL DEFAULT 3,
    "booking_target_per_month" INTEGER NOT NULL DEFAULT 0,

    "language_variant" "platform"."LanguageVariant" NOT NULL DEFAULT 'AU',
    "platform_instagram" BOOLEAN NOT NULL DEFAULT true,
    "platform_facebook" BOOLEAN NOT NULL DEFAULT false,
    "platform_tiktok" BOOLEAN NOT NULL DEFAULT false,
    "medical_aesthetics_compliance" BOOLEAN NOT NULL DEFAULT false,
    "use_asset_library" BOOLEAN NOT NULL DEFAULT true,

    "user_written_story" TEXT,
    "ai_drafted_story" TEXT,

    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "brand_dna_profiles_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "platform"."brand_dna_profiles" ADD CONSTRAINT "brand_dna_profiles_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "unique_current_brand_dna_profile" ON "platform"."brand_dna_profiles"("tenant_id", "is_current");
CREATE INDEX IF NOT EXISTS "brand_dna_profiles_tenant_id_idx" ON "platform"."brand_dna_profiles"("tenant_id");
