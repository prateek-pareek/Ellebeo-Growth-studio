-- Growth Studio — all remaining tables (safe, IF NOT EXISTS throughout)

-- ── Enums ────────────────────────────────────────────────────────────────────

DO $$ BEGIN CREATE TYPE platform."ConsentStatus"       AS ENUM ('granted','pending','declined','withdrawn');         EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."BusinessGoalType"    AS ENUM ('attract_new_clients','fill_quiet_days','promote_high_margin_service','build_brand_authority','client_retention'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."ContentStatus"       AS ENUM ('draft','pending','processing','completed','approved','scheduled','published','blocked','flagged','archived','failed'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."JobState"            AS ENUM ('created','queued','processing_image','processing_vision','building_prompt','generating_text','generating_reel','completed','failed','retrying','blocked','dead_letter'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."SocialAccountStatus" AS ENUM ('connected','disconnected','token_expired','error');  EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."PublishStatus"       AS ENUM ('pending','published','failed','cancelled');          EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."ToneRating"          AS ENUM ('sounds_like_me','close_but_not_quite','doesnt_sound_like_me'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."BrandAesthetic"      AS ENUM ('minimalist_clean','moody_editorial','bright_playful','soft_feminine','bold_luxury'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE platform."BrandTier"           AS ENUM ('luxury','mainstream','accessible');                 EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── clients ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.clients (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID         NOT NULL REFERENCES platform.tenants(id),
  first_name   VARCHAR(255) NOT NULL,
  last_name    VARCHAR(255) NOT NULL,
  email        VARCHAR(320),
  phone        VARCHAR(50),
  last_visit_at TIMESTAMPTZ,
  is_active    BOOLEAN      NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_clients_tenant_id_idx ON platform.clients(tenant_id);
CREATE INDEX IF NOT EXISTS gs_clients_email_idx     ON platform.clients(email);

-- ── consent_records ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.consent_records (
  id                     UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id              UUID                      NOT NULL REFERENCES platform.tenants(id),
  client_id              UUID                      NOT NULL REFERENCES platform.clients(id),
  appointment_id         UUID                      UNIQUE,
  status                 platform."ConsentStatus"  NOT NULL DEFAULT 'pending',
  allow_show_face        BOOLEAN                   NOT NULL DEFAULT false,
  allow_use_name         BOOLEAN                   NOT NULL DEFAULT false,
  allow_tag_social       BOOLEAN                   NOT NULL DEFAULT false,
  allow_platform_promotion BOOLEAN                 NOT NULL DEFAULT false,
  allow_internal_use     BOOLEAN                   NOT NULL DEFAULT false,
  allow_marketing_content BOOLEAN                  NOT NULL DEFAULT false,
  consent_method         VARCHAR(50)               NOT NULL DEFAULT 'manual',
  signature_url          VARCHAR(2000),
  withdrawal_reason      TEXT,
  granted_at             TIMESTAMPTZ,
  withdrawn_at           TIMESTAMPTZ,
  is_current             BOOLEAN                   NOT NULL DEFAULT true,
  superseded_by_id       UUID,
  created_at             TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at             TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  superseded_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_consent_records_tenant_id_idx  ON platform.consent_records(tenant_id);
CREATE INDEX IF NOT EXISTS gs_consent_records_client_id_idx  ON platform.consent_records(client_id);
CREATE INDEX IF NOT EXISTS gs_consent_records_status_idx     ON platform.consent_records(status);

-- ── appointments ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.appointments (
  id                   UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID         NOT NULL REFERENCES platform.tenants(id),
  client_id            UUID         NOT NULL REFERENCES platform.clients(id),
  consent_record_id    UUID         UNIQUE,
  service_category     VARCHAR(100) NOT NULL,
  service_name         VARCHAR(255) NOT NULL,
  appointment_date     TIMESTAMPTZ  NOT NULL,
  appointment_time     TIMESTAMPTZ,
  duration_minutes     INTEGER,
  external_id          VARCHAR(255),
  source               VARCHAR(50)  NOT NULL DEFAULT 'manual',
  notes                TEXT,
  service_description  TEXT,
  is_cancelled         BOOLEAN      NOT NULL DEFAULT false,
  cancellation_reason  TEXT,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_appointments_tenant_date_idx ON platform.appointments(tenant_id, appointment_date);
CREATE INDEX IF NOT EXISTS gs_appointments_client_id_idx   ON platform.appointments(client_id);

-- Add FK from consent_records to appointments now that appointments exists
DO $$ BEGIN
  ALTER TABLE platform.consent_records ADD CONSTRAINT fk_consent_appointment FOREIGN KEY (appointment_id) REFERENCES platform.appointments(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE platform.consent_records ADD CONSTRAINT fk_consent_superseded_by FOREIGN KEY (superseded_by_id) REFERENCES platform.consent_records(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE platform.appointments ADD CONSTRAINT fk_appointment_consent_record FOREIGN KEY (consent_record_id) REFERENCES platform.consent_records(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── brand_dna ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.brand_dna (
  id                        UUID                   PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID                   NOT NULL REFERENCES platform.tenants(id),
  version                   INTEGER                NOT NULL DEFAULT 1,
  is_current                BOOLEAN                NOT NULL DEFAULT true,
  business_name             VARCHAR(255)           NOT NULL,
  one_liner                 TEXT,
  unique_selling_proposition TEXT,
  signature_outcome         VARCHAR(500),
  primary_persona           VARCHAR(255),
  secondary_persona         VARCHAR(255),
  client_pain_points        TEXT[]                 NOT NULL DEFAULT '{}',
  primary_tone              VARCHAR(100),
  secondary_tone            VARCHAR(100),
  emoji_policy              VARCHAR(50)            NOT NULL DEFAULT 'minimal',
  vocabulary_blacklist      TEXT[]                 NOT NULL DEFAULT '{}',
  vocabulary_preferred      TEXT[]                 NOT NULL DEFAULT '{}',
  do_not_say                TEXT[]                 NOT NULL DEFAULT '{}',
  formatting_style          TEXT,
  aesthetic_direction       TEXT,
  mood_tag                  VARCHAR(100),
  primary_brand_color       VARCHAR(50),
  secondary_brand_color     VARCHAR(50),
  brand_font                VARCHAR(100),
  location_city             VARCHAR(255),
  brand_tier                platform."BrandTier"   NOT NULL DEFAULT 'mainstream',
  caption_length_preference VARCHAR(50)            NOT NULL DEFAULT 'medium',
  emoji_style               VARCHAR(50)            NOT NULL DEFAULT 'minimal',
  average_confidence_score  FLOAT                  NOT NULL DEFAULT 0.5,
  preferred_model_override  VARCHAR(100),
  last_updated_at           TIMESTAMPTZ            NOT NULL DEFAULT NOW(),
  auto_populated            BOOLEAN                NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX IF NOT EXISTS gs_brand_dna_unique_current ON platform.brand_dna(tenant_id, is_current);
CREATE INDEX IF NOT EXISTS gs_brand_dna_tenant_id_idx         ON platform.brand_dna(tenant_id);

-- ── brand_pillars ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.brand_pillars (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id    UUID        NOT NULL REFERENCES platform.tenants(id),
  brand_dna_id UUID        NOT NULL REFERENCES platform.brand_dna(id),
  label        VARCHAR(255) NOT NULL,
  description  TEXT,
  keywords     TEXT[]      NOT NULL DEFAULT '{}',
  priority     INTEGER     NOT NULL DEFAULT 3,
  sort_order   INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gs_brand_pillars_tenant_id_idx ON platform.brand_pillars(tenant_id);

-- ── brand_goals ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.brand_goals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES platform.tenants(id),
  brand_dna_id  UUID        NOT NULL REFERENCES platform.brand_dna(id),
  label         VARCHAR(255) NOT NULL,
  description   TEXT,
  target_metric VARCHAR(255),
  is_active     BOOLEAN     NOT NULL DEFAULT true,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gs_brand_goals_tenant_id_idx ON platform.brand_goals(tenant_id);

-- ── image_assets ──────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.image_assets (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID        NOT NULL REFERENCES platform.tenants(id),
  appointment_id      UUID        REFERENCES platform.appointments(id),
  content_item_id     UUID,
  raw_url             VARCHAR(2000),
  cloudinary_public_id VARCHAR(500),
  asset_type          VARCHAR(50) NOT NULL DEFAULT 'image',
  s3_key              VARCHAR(1000),
  s3_bucket           VARCHAR(500),
  s3_object_hash      VARCHAR(255),
  file_size_bytes     INTEGER,
  is_before_photo     BOOLEAN     NOT NULL DEFAULT false,
  is_after_photo      BOOLEAN     NOT NULL DEFAULT false,
  upload_validated    BOOLEAN     NOT NULL DEFAULT false,
  vision_analysis     JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at          TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_image_assets_tenant_id_idx ON platform.image_assets(tenant_id);

-- ── golden_examples ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.golden_examples (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID        NOT NULL REFERENCES platform.tenants(id),
  caption_text  TEXT        NOT NULL,
  hashtags      TEXT[]      NOT NULL DEFAULT '{}',
  quality_score FLOAT       NOT NULL DEFAULT 1.0,
  is_approved   BOOLEAN     NOT NULL DEFAULT true,
  is_pending    BOOLEAN     NOT NULL DEFAULT false,
  approved_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gs_golden_examples_tenant_id_idx ON platform.golden_examples(tenant_id);

-- ── business_goals ────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.business_goals (
  id            UUID                        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID                        NOT NULL REFERENCES platform.tenants(id),
  goal_type     platform."BusinessGoalType" NOT NULL,
  description   TEXT,
  target_value  FLOAT,
  current_value FLOAT                       NOT NULL DEFAULT 0,
  is_active     BOOLEAN                     NOT NULL DEFAULT true,
  start_date    DATE,
  end_date      DATE,
  created_at    TIMESTAMPTZ                 NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gs_business_goals_tenant_id_idx ON platform.business_goals(tenant_id, is_active);

-- ── generation_jobs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.generation_jobs (
  id                 UUID                    PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          UUID                    NOT NULL REFERENCES platform.tenants(id),
  appointment_id     UUID                    NOT NULL REFERENCES platform.appointments(id),
  client_id          UUID                    NOT NULL REFERENCES platform.clients(id),
  state              platform."JobState"     NOT NULL DEFAULT 'created',
  job_payload        JSONB                   NOT NULL,
  consent_snapshot   JSONB                   NOT NULL,
  brand_dna_snapshot JSONB                   NOT NULL,
  brand_dna_version  INTEGER                 NOT NULL,
  output_formats     TEXT[]                  NOT NULL DEFAULT '{}',
  platforms          TEXT[]                  NOT NULL DEFAULT '{}',
  include_voiceover  BOOLEAN                 NOT NULL DEFAULT false,
  include_music      BOOLEAN                 NOT NULL DEFAULT false,
  error_code         VARCHAR(100),
  error_message      TEXT,
  model_used         VARCHAR(100),
  tokens_input       INTEGER,
  tokens_output      INTEGER,
  processing_ms      INTEGER,
  estimated_cost_usd FLOAT,
  created_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ             NOT NULL DEFAULT NOW(),
  completed_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_generation_jobs_tenant_state_idx ON platform.generation_jobs(tenant_id, state);
CREATE INDEX IF NOT EXISTS gs_generation_jobs_appointment_idx  ON platform.generation_jobs(appointment_id);

-- ── content_items ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.content_items (
  id                        UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                 UUID                      NOT NULL REFERENCES platform.tenants(id),
  appointment_id            UUID                      NOT NULL REFERENCES platform.appointments(id),
  generation_job_id         UUID                      REFERENCES platform.generation_jobs(id),
  status                    platform."ContentStatus"  NOT NULL DEFAULT 'draft',
  caption_status            platform."ContentStatus"  NOT NULL DEFAULT 'draft',
  image_status              platform."ContentStatus"  NOT NULL DEFAULT 'draft',
  reel_status               platform."ContentStatus"  NOT NULL DEFAULT 'draft',
  hook_sentence             TEXT,
  caption                   TEXT,
  reel_script               TEXT,
  alt_text                  TEXT,
  estimated_read_time       INTEGER,
  confidence_score          FLOAT,
  platform_variants         JSONB,
  generation_options        JSONB[]                   NOT NULL DEFAULT '{}',
  selected_model            VARCHAR(100),
  hashtags                  TEXT[]                    NOT NULL DEFAULT '{}',
  call_to_action            TEXT,
  voiceover_url             VARCHAR(2000),
  music_url                 VARCHAR(2000),
  final_video_url           VARCHAR(2000),
  reel_thumbnail_url        VARCHAR(2000),
  processed_image_url_feed  VARCHAR(2000),
  export_pack_url           VARCHAR(2000),
  export_generated_at       TIMESTAMPTZ,
  technician_tone_rating    VARCHAR(50),
  rated_at                  TIMESTAMPTZ,
  is_admin_flagged          BOOLEAN                   NOT NULL DEFAULT false,
  flagged_reason            TEXT,
  blocked_reason            TEXT,
  tone_rating               platform."ToneRating",
  approved_at               TIMESTAMPTZ,
  approved_by               UUID                      REFERENCES platform.users(id),
  created_at                TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  completed_at              TIMESTAMPTZ,
  deleted_at                TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_content_items_tenant_status_idx ON platform.content_items(tenant_id, status);
CREATE INDEX IF NOT EXISTS gs_content_items_appointment_idx   ON platform.content_items(appointment_id);

-- Add FK from image_assets to content_items (now that content_items exists)
DO $$ BEGIN
  ALTER TABLE platform.image_assets ADD CONSTRAINT fk_image_asset_content_item FOREIGN KEY (content_item_id) REFERENCES platform.content_items(id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── social_accounts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.social_accounts (
  id                  UUID                           PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id           UUID                           NOT NULL REFERENCES platform.tenants(id),
  platform            VARCHAR(100)                   NOT NULL,
  platform_account_id VARCHAR(255),
  account_name        VARCHAR(500),
  account_handle      VARCHAR(500),
  profile_picture_url VARCHAR(2000),
  status              platform."SocialAccountStatus" NOT NULL DEFAULT 'connected',
  access_token        TEXT,
  refresh_token       TEXT,
  token_expires_at    TIMESTAMPTZ,
  token_refreshed_at  TIMESTAMPTZ,
  scopes_granted      TEXT[]                         NOT NULL DEFAULT '{}',
  last_publish_at     TIMESTAMPTZ,
  last_error          TEXT,
  created_at          TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ                    NOT NULL DEFAULT NOW(),
  CONSTRAINT gs_unique_platform_per_tenant UNIQUE (tenant_id, platform)
);
CREATE INDEX IF NOT EXISTS gs_social_accounts_tenant_id_idx     ON platform.social_accounts(tenant_id);
CREATE INDEX IF NOT EXISTS gs_social_accounts_token_expires_idx ON platform.social_accounts(token_expires_at);

-- ── campaigns ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.campaigns (
  id                   UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id            UUID                         NOT NULL REFERENCES platform.tenants(id),
  name                 VARCHAR(500)                 NOT NULL,
  description          TEXT,
  goal_type            platform."BusinessGoalType",
  start_date           DATE,
  end_date             DATE,
  total_posts_planned  INTEGER                      NOT NULL DEFAULT 0,
  total_posts_approved INTEGER                      NOT NULL DEFAULT 0,
  total_posts_published INTEGER                     NOT NULL DEFAULT 0,
  is_active            BOOLEAN                      NOT NULL DEFAULT true,
  created_at           TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ                  NOT NULL DEFAULT NOW(),
  deleted_at           TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_campaigns_tenant_id_idx ON platform.campaigns(tenant_id);

-- ── scheduled_posts ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.scheduled_posts (
  id                UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID                      NOT NULL REFERENCES platform.tenants(id),
  content_item_id   UUID                      NOT NULL REFERENCES platform.content_items(id),
  social_account_id UUID                      NOT NULL REFERENCES platform.social_accounts(id),
  campaign_id       UUID                      REFERENCES platform.campaigns(id),
  platform          TEXT                      NOT NULL,
  post_format       TEXT                      NOT NULL,
  caption_override  TEXT,
  hashtags_override TEXT[]                    NOT NULL DEFAULT '{}',
  scheduled_for     TIMESTAMPTZ               NOT NULL,
  publish_status    platform."PublishStatus"  NOT NULL DEFAULT 'pending',
  published_at      TIMESTAMPTZ,
  platform_post_id  VARCHAR(500),
  platform_post_url VARCHAR(2000),
  failed_at         TIMESTAMPTZ,
  failure_reason    TEXT,
  retry_count       INTEGER                   NOT NULL DEFAULT 0,
  last_retry_at     TIMESTAMPTZ,
  created_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ               NOT NULL DEFAULT NOW(),
  deleted_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS gs_scheduled_posts_tenant_id_idx        ON platform.scheduled_posts(tenant_id);
CREATE INDEX IF NOT EXISTS gs_scheduled_posts_tenant_scheduled_idx ON platform.scheduled_posts(tenant_id, scheduled_for);
CREATE INDEX IF NOT EXISTS gs_scheduled_posts_content_item_idx     ON platform.scheduled_posts(content_item_id);
CREATE INDEX IF NOT EXISTS gs_scheduled_posts_campaign_idx         ON platform.scheduled_posts(campaign_id);

-- ── generation_audit_log ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.generation_audit_log (
  id                       UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id                UUID        NOT NULL REFERENCES platform.tenants(id),
  job_id                   UUID        REFERENCES platform.generation_jobs(id),
  timestamp                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  input_instruction        TEXT,
  sanitisation_passed      BOOLEAN     NOT NULL,
  sanitisation_flag_reason VARCHAR(100),
  output_validation_passed BOOLEAN,
  output_hard_failures     TEXT[]      NOT NULL DEFAULT '{}',
  output_auto_corrections  TEXT[]      NOT NULL DEFAULT '{}',
  model_used               VARCHAR(100),
  service_category         VARCHAR(100),
  flag_triggered           BOOLEAN     NOT NULL DEFAULT false,
  flag_reasons             TEXT[]      NOT NULL DEFAULT '{}',
  required_regeneration    BOOLEAN     NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS gs_audit_log_tenant_timestamp_idx ON platform.generation_audit_log(tenant_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS gs_audit_log_tenant_flag_idx      ON platform.generation_audit_log(tenant_id, flag_triggered);

-- ── generation_fingerprints ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.generation_fingerprints (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   UUID        NOT NULL REFERENCES platform.tenants(id),
  fingerprint VARCHAR(64) NOT NULL,
  content_id  UUID        REFERENCES platform.content_items(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT gs_unique_fingerprint_per_tenant UNIQUE (tenant_id, fingerprint)
);
CREATE INDEX IF NOT EXISTS gs_fingerprints_tenant_id_idx ON platform.generation_fingerprints(tenant_id);

-- ── failed_jobs ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS platform.failed_jobs (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id  UUID        NOT NULL REFERENCES platform.generation_jobs(id),
  tenant_id        UUID        NOT NULL REFERENCES platform.tenants(id),
  job_payload      JSONB       NOT NULL,
  error_message    TEXT        NOT NULL,
  error_stack      TEXT,
  failed_at_step   VARCHAR(100),
  retry_count      INTEGER     NOT NULL DEFAULT 0,
  is_resolved      BOOLEAN     NOT NULL DEFAULT false,
  resolved_at      TIMESTAMPTZ,
  resolved_by      UUID        REFERENCES platform.users(id),
  resolution_notes TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS gs_failed_jobs_tenant_id_idx ON platform.failed_jobs(tenant_id);
