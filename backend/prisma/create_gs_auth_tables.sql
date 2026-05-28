-- Growth Studio auth tables — safe targeted creation
-- Does NOT touch any existing main admin tables

-- Ensure uuid generation is available
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- SubscriptionTier enum
DO $$ BEGIN
  CREATE TYPE platform."SubscriptionTier" AS ENUM ('free', 'standard', 'premium');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TenantStatus enum
DO $$ BEGIN
  CREATE TYPE platform."TenantStatus" AS ENUM ('active', 'restricted', 'suspended', 'churned');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- users table
CREATE TABLE IF NOT EXISTS platform.users (
  id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  email           VARCHAR(320)  UNIQUE NOT NULL,
  password_hash   VARCHAR(255)  NOT NULL,
  role            VARCHAR(50)   NOT NULL DEFAULT 'technician',
  email_verified  BOOLEAN       NOT NULL DEFAULT false,
  email_verified_at TIMESTAMPTZ,
  last_login_at   TIMESTAMPTZ,
  failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gs_users_email_idx ON platform.users(email);
CREATE INDEX IF NOT EXISTS gs_users_role_idx  ON platform.users(role);

-- tenants table
CREATE TABLE IF NOT EXISTS platform.tenants (
  id                      UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID          UNIQUE NOT NULL REFERENCES platform.users(id),
  business_name           VARCHAR(255)  NOT NULL,
  display_name            VARCHAR(255),
  subscription_tier       platform."SubscriptionTier" NOT NULL DEFAULT 'free',
  subscription_started_at TIMESTAMPTZ,
  subscription_expires_at TIMESTAMPTZ,
  status                  platform."TenantStatus" NOT NULL DEFAULT 'active',
  has_growth_studio_access BOOLEAN      NOT NULL DEFAULT false,
  generation_restricted   BOOLEAN       NOT NULL DEFAULT false,
  generation_suspended    BOOLEAN       NOT NULL DEFAULT false,
  abuse_flag_count        INTEGER       NOT NULL DEFAULT 0,
  last_abuse_flag_at      TIMESTAMPTZ,
  stripe_customer_id      VARCHAR(255),
  stripe_subscription_id  VARCHAR(255),
  timezone                VARCHAR(100)  NOT NULL DEFAULT 'UTC',
  locale                  VARCHAR(20)   NOT NULL DEFAULT 'en-AU',
  onboarding_completed    BOOLEAN       NOT NULL DEFAULT false,
  onboarding_step         INTEGER       NOT NULL DEFAULT 1,
  created_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS gs_tenants_user_id_idx           ON platform.tenants(user_id);
CREATE INDEX IF NOT EXISTS gs_tenants_status_idx            ON platform.tenants(status);
CREATE INDEX IF NOT EXISTS gs_tenants_subscription_tier_idx ON platform.tenants(subscription_tier);

-- refresh_tokens table
CREATE TABLE IF NOT EXISTS platform.refresh_tokens (
  id          UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID          NOT NULL REFERENCES platform.users(id),
  token_hash  VARCHAR(255)  UNIQUE NOT NULL,
  expires_at  TIMESTAMPTZ   NOT NULL,
  revoked_at  TIMESTAMPTZ,
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS gs_refresh_tokens_user_id_idx   ON platform.refresh_tokens(user_id);
CREATE INDEX IF NOT EXISTS gs_refresh_tokens_expires_at_idx ON platform.refresh_tokens(expires_at);
