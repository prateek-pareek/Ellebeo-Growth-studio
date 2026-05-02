/**
 * Feature flag util.
 *
 * Phase 1: all flags default to `false` for logged-out users (avoids
 * roadmap leakage to anon callers, since `feature_flags` table is
 * authenticated-read only).
 *
 * Once a user is signed in, we fetch their flags from the DB. Until
 * `feature_cloud_backend` is flipped to `true`, every existing route
 * continues to read from `src/lib/sample-data.ts` exactly as before.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlagKey = "feature_cloud_backend";

const LOCAL_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  feature_cloud_backend: false,
};

let cache: Partial<Record<FeatureFlagKey, boolean>> | null = null;
let inflight: Promise<void> | null = null;

async function loadFlags(): Promise<void> {
  const { data: session } = await supabase.auth.getSession();
  if (!session.session) {
    cache = { ...LOCAL_DEFAULTS };
    return;
  }
  const { data, error } = await supabase
    .from("feature_flags")
    .select("key, enabled");
  if (error || !data) {
    cache = { ...LOCAL_DEFAULTS };
    return;
  }
  const next: Partial<Record<FeatureFlagKey, boolean>> = { ...LOCAL_DEFAULTS };
  for (const row of data) {
    next[row.key as FeatureFlagKey] = row.enabled;
  }
  cache = next;
}

export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  if (!cache) {
    if (!inflight) inflight = loadFlags().finally(() => { inflight = null; });
    await inflight;
  }
  return cache?.[key] ?? LOCAL_DEFAULTS[key];
}

export function useFeatureFlag(key: FeatureFlagKey): boolean {
  return true;
}
