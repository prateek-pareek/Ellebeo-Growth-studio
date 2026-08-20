-- Adds the feature_flags table.
--
-- The FeatureFlag model exists in schema.prisma but no migration ever created
-- the table, so FeatureFlagService.findUnique threw on every call. Every page
-- in the app asks for GROWTH_STUDIO_VIDEO on load, which meant a 500 on every
-- page load.
--
-- Additive only: creates one table, touches nothing that exists.
CREATE TABLE IF NOT EXISTS "platform"."feature_flags" (
    "key" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "rollout_percentage" INTEGER NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_flags_pkey" PRIMARY KEY ("key")
);
