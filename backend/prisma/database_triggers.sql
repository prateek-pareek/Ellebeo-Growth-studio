-- ----------------------------------------------------------------------------
-- CUSTOM TRIGGERS & EXTENSIONS
-- Run this AFTER Prisma generates the tables
-- ----------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "btree_gin";

-- ----------------------------------------------------------------------------
-- Trigger 1: updated_at auto-maintenance
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_tenants_updated_at BEFORE UPDATE ON tenants FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_brand_dna_updated_at BEFORE UPDATE ON brand_dna FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_clients_updated_at BEFORE UPDATE ON clients FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_consent_records_updated_at BEFORE UPDATE ON consent_records FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_appointments_updated_at BEFORE UPDATE ON appointments FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_image_assets_updated_at BEFORE UPDATE ON image_assets FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_golden_examples_updated_at BEFORE UPDATE ON golden_examples FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_business_goals_updated_at BEFORE UPDATE ON business_goals FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_generation_jobs_updated_at BEFORE UPDATE ON generation_jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_content_items_updated_at BEFORE UPDATE ON content_items FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_social_accounts_updated_at BEFORE UPDATE ON social_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_scheduled_posts_updated_at BEFORE UPDATE ON scheduled_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ----------------------------------------------------------------------------
-- Trigger 2: Consent withdrawal cascade
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cascade_consent_withdrawal()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'withdrawn' AND OLD.status != 'withdrawn' THEN
    -- Block all draft and approved content items linked to this client
    UPDATE content_items
    SET status = 'blocked',
        blocked_reason = 'Client consent withdrawn',
        updated_at = NOW()
    WHERE appointment_id IN (
      SELECT id FROM appointments WHERE client_id = NEW.client_id
    )
    AND status IN ('draft', 'approved');

    -- Cancel all pending scheduled posts
    UPDATE scheduled_posts
    SET publish_status = 'cancelled',
        updated_at = NOW()
    WHERE content_item_id IN (
      SELECT id FROM content_items
      WHERE appointment_id IN (
        SELECT id FROM appointments WHERE client_id = NEW.client_id
      )
    )
    AND publish_status = 'pending';

    -- Record the withdrawal timestamp
    NEW.withdrawn_at = NOW();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_consent_withdrawal_cascade
  BEFORE UPDATE ON consent_records
  FOR EACH ROW EXECUTE FUNCTION cascade_consent_withdrawal();


-- ----------------------------------------------------------------------------
-- Trigger 3: Appointment cancellation cascade
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cascade_appointment_cancellation()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_cancelled = true AND OLD.is_cancelled = false THEN
    NEW.cancelled_at = NOW();

    UPDATE content_items
    SET status = 'archived',
        updated_at = NOW()
    WHERE appointment_id = NEW.id
    AND status IN ('draft', 'approved');

    UPDATE scheduled_posts
    SET publish_status = 'cancelled',
        updated_at = NOW()
    WHERE content_item_id IN (
      SELECT id FROM content_items WHERE appointment_id = NEW.id
    )
    AND publish_status = 'pending';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_cancellation
  BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION cascade_appointment_cancellation();


-- ----------------------------------------------------------------------------
-- Trigger 4: Brand DNA version increment
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION increment_brand_dna_version()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_current = true AND OLD.is_current = true THEN
    NEW.version = OLD.version + 1;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_brand_dna_version
  BEFORE UPDATE ON brand_dna
  FOR EACH ROW EXECUTE FUNCTION increment_brand_dna_version();
