-- CRM Integration Step 1: Growth Studio Schema Extensions
-- Adds CRM linking fields and new tables for booking/questionnaire data

-- 1a. Link appointments to CRM booking UUID
ALTER TABLE platform.appointments
  ADD COLUMN IF NOT EXISTS crm_booking_id UUID;

CREATE INDEX IF NOT EXISTS idx_appointments_crm_booking_id
  ON platform.appointments (crm_booking_id)
  WHERE crm_booking_id IS NOT NULL;

-- 1b. Link consent records to the CRM booking that provided consent
ALTER TABLE platform.consent_records
  ADD COLUMN IF NOT EXISTS crm_booking_id UUID;

-- 1c. Link image assets to CRM portfolio media source
ALTER TABLE platform.image_assets
  ADD COLUMN IF NOT EXISTS crm_media_id UUID;

-- 1d. Questionnaire responses imported from BookingConsultationRecord
CREATE TABLE IF NOT EXISTS platform.appointment_questionnaire_responses (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id  UUID        NOT NULL REFERENCES platform.appointments(id) ON DELETE CASCADE,
  crm_booking_id  UUID        NOT NULL,
  question_key    TEXT        NOT NULL,
  question_label  TEXT,
  answer          TEXT,
  answered_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quest_resp_appointment_id
  ON platform.appointment_questionnaire_responses (appointment_id);

CREATE INDEX IF NOT EXISTS idx_quest_resp_crm_booking_id
  ON platform.appointment_questionnaire_responses (crm_booking_id);

-- 1e. Per-tenant CRM integration configuration
CREATE TABLE IF NOT EXISTS platform.crm_integration_configs (
  id                    UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id             UUID         UNIQUE NOT NULL REFERENCES platform.tenants(id) ON DELETE CASCADE,
  crm_sync_enabled      BOOLEAN      NOT NULL DEFAULT false,
  auto_import_bookings  BOOLEAN      NOT NULL DEFAULT false,
  auto_map_media        BOOLEAN      NOT NULL DEFAULT true,
  webhook_secret        VARCHAR(255),
  last_synced_at        TIMESTAMPTZ,
  created_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
