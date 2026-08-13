/**
 * Feature flag util.
 *
 * `feature_cloud_backend` is now ON by default so all providers read from
 * the real NestJS API at VITE_API_URL (http://localhost:3001).
 *
 * If the user is not signed in, providers gracefully fall back to sample data.
 */
import { useEffect, useState } from "react";

export type FeatureFlagKey = "feature_cloud_backend" | "GROWTH_STUDIO_VIDEO" | "BRAND_DNA_GUIDED_V2";

const LOCAL_DEFAULTS: Record<FeatureFlagKey, boolean> = {
  feature_cloud_backend: true, // ← LIVE: routes now call the real backend
  GROWTH_STUDIO_VIDEO: import.meta.env.VITE_GROWTH_STUDIO_VIDEO === "true",
  // Gemini Lab guided Brand DNA. Default on. Does not replace /brand/onboarding.
  BRAND_DNA_GUIDED_V2: import.meta.env.VITE_BRAND_DNA_GUIDED_V2 !== "false",
};

// Simple hook — returns the flag value from LOCAL_DEFAULTS.
// Future: can be extended to fetch overrides from the backend after login.
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const [value, setValue] = useState<boolean>(LOCAL_DEFAULTS[key]);

  useEffect(() => {
    // Currently reads only from LOCAL_DEFAULTS.
    // When backend feature_flags table is ready, fetch here and call setValue.
    setValue(LOCAL_DEFAULTS[key]);
  }, [key]);

  return value;
}

export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  return LOCAL_DEFAULTS[key];
}
