/**
 * Appointments data provider — Phase 4 (read-only).
 *
 * Mirrors the brand-dna provider pattern.
 *   - flag off OR signed-out OR error → sample data
 *   - flag on AND signed-in AND rows → cloud
 *   - flag on AND signed-in AND zero rows → empty state (handled by caller)
 *
 * Cloud → view mapping:
 *   - status is derived from scheduled_at (>= now ? upcoming : completed),
 *     but the existing UI keys off `consent`. The DB has no consent column on
 *     appointments yet, so cloud rows default to `not_requested`.
 *   - photos / contentReady aren't in the appointments table → defaulted.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFeatureFlag } from "@/lib/feature-flags";
import { appointments as sampleAppointments, type Appointment, type Category } from "@/lib/sample-data";

export type AppointmentsSource = "sample" | "cloud";

export type UseAppointmentsResult = {
  data: Appointment[];
  loading: boolean;
  source: AppointmentsSource;
  /** True when cloud lookup succeeded but the user has zero appointments. */
  isEmpty: boolean;
  /** True when we attempted cloud and fell back to sample. */
  error: boolean;
  refresh?: () => void;
};

function sampleResult(): UseAppointmentsResult {
  return { data: sampleAppointments, loading: false, source: "sample", isEmpty: false, error: false };
}

const CATEGORY_MAP: Record<string, Category> = {
  HAIRDRESSER: "Hairdresser",
  COLOURIST: "Colourist",
  BRIDAL_MAKEUP: "Bridal makeup",
  LASH_BROW: "Lash & brow",
  NAIL_ARTIST: "Nail artist",
  INJECTOR: "Injector",
  SKIN_THERAPIST: "Skin therapist",
  BARBER: "Barber",
};

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function fetchCloudAppointments(): Promise<
  | { kind: "ok"; data: Appointment[] }
  | { kind: "empty" }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  try {
    const res = await api.get('/appointments');
    const data = res.data.data;
    
    if (!data || data.length === 0) return { kind: "empty" };

    return {
      kind: "ok",
      data: data.map((row: any) => ({
        id: row.id,
        clientName: row.clientName || "Client",
        service: row.serviceName,
        category: CATEGORY_MAP[row.serviceCategory] || "Skin therapist",
        date: formatDate(row.appointmentDate),
        hasBefore: false,
        hasAfter: false,
        consent: row.consentStatus || "not_requested",
        notes: row.notes,
        contentReady: 0,
      })),
    };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.message };
  }
}

export function useAppointments(): UseAppointmentsResult {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [state, setState] = useState<UseAppointmentsResult>(() => sampleResult());
  const reqId = useRef(0);

  const fetch = (id: number) => {
    setState((prev) => ({ ...prev, loading: true }));
    fetchCloudAppointments()
      .then((res) => {
        if (id !== reqId.current) return;
        if (res.kind === "ok") {
          setState({ data: res.data, loading: false, source: "cloud", isEmpty: false, error: false });
        } else if (res.kind === "empty") {
          setState({ data: [], loading: false, source: "cloud", isEmpty: true, error: false });
        } else if (res.kind === "anon") {
          setState(sampleResult());
        } else {
          // eslint-disable-next-line no-console
          console.warn("[appointments] cloud fetch failed, using sample:", res.message);
          setState({ ...sampleResult(), error: true });
        }
      })
      .catch((err) => {
        if (id !== reqId.current) return;
        // eslint-disable-next-line no-console
        console.warn("[appointments] cloud fetch threw, using sample:", err);
        setState({ ...sampleResult(), error: true });
      });
  };

  useEffect(() => {
    if (!cloudEnabled) {
      setState(sampleResult());
      return;
    }
    const id = ++reqId.current;
    fetch(id);
  }, [cloudEnabled]);

  return { 
    ...state, 
    refresh: () => {
      const id = ++reqId.current;
      fetch(id);
    } 
  };
}
