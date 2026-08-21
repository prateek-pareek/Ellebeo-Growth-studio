/**
 * Feature flag util.
 *
 * `feature_cloud_backend` is now ON by default so all providers read from
 * the real NestJS API at VITE_API_URL (http://localhost:3001).
 *
 * If the user is not signed in, providers gracefully fall back to sample data.
 *
 * `GROWTH_STUDIO_VIDEO` is the first flag backed by the real backend table
 * (Phase 9 of the video pipeline) — fetched from `GET /feature-flags/:key`,
 * defaulting to false (closed) if the request fails or the user is
 * signed out, so an anonymous/error state never accidentally shows a
 * gated feature.
 */
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export type FeatureFlagKey = "feature_cloud_backend" | "GROWTH_STUDIO_VIDEO";

const LOCAL_DEFAULTS: Partial<Record<FeatureFlagKey, boolean>> = {
  feature_cloud_backend: true, // ← LIVE: routes now call the real backend
};

async function fetchBackendFlag(key: FeatureFlagKey): Promise<boolean> {
  // The endpoint requires authentication, so asking while signed out is a
  // guaranteed 401 — and this hook runs inside AppShell, which renders on the
  // login screen. Failing closed here means the login page makes no
  // authenticated calls at all.
  if (!localStorage.getItem('accessToken')) return false;
  try {
    const res = await api.get(`/feature-flags/${key}`);
    return Boolean(res.data?.data?.enabled ?? res.data?.enabled);
  } catch {
    return false; // fail closed
  }
}

// Local flags (feature_cloud_backend) read from LOCAL_DEFAULTS unchanged.
// Anything else is backed by the real feature_flags table (Phase 9).
export function useFeatureFlag(key: FeatureFlagKey): boolean {
  const [value, setValue] = useState<boolean>(LOCAL_DEFAULTS[key] ?? false);

  useEffect(() => {
    if (key in LOCAL_DEFAULTS) {
      setValue(LOCAL_DEFAULTS[key]!);
      return;
    }
    let cancelled = false;
    fetchBackendFlag(key).then((enabled) => {
      if (!cancelled) setValue(enabled);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  return value;
}

export async function getFeatureFlag(key: FeatureFlagKey): Promise<boolean> {
  if (key in LOCAL_DEFAULTS) return LOCAL_DEFAULTS[key]!;
  return fetchBackendFlag(key);
}
