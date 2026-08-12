CREATE TABLE IF NOT EXISTS "platform"."brand_dna_onboarding_events" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tenant_id" UUID NOT NULL,
    "event" VARCHAR(50) NOT NULL,
    "step" INTEGER,
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "brand_dna_onboarding_events_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "platform"."brand_dna_onboarding_events" ADD CONSTRAINT "brand_dna_onboarding_events_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "platform"."tenants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "brand_dna_onboarding_events_tenant_id_idx" ON "platform"."brand_dna_onboarding_events"("tenant_id");
CREATE INDEX IF NOT EXISTS "brand_dna_onboarding_events_event_idx" ON "platform"."brand_dna_onboarding_events"("event");
