/**
 * Consent request provider — Phase 5 (read-only, technician preview).
 *
 *   - flag off OR signed-out OR error → sample (matched against sample
 *     appointments by id, just like the original loader).
 *   - flag on AND signed-in → look up the consent_request by id from
 *     consent_requests; pull the parent appointment for context.
 *
 * No writes. No real send/resend. No public token route.
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFeatureFlag } from "@/lib/feature-flags";
import { appointments as sampleAppointments } from "@/lib/sample-data";

export type ConsentView = {
  appointment: {
    id: string;
    clientName: string;
    service: string;
    date: string;
    afterImage?: string;
  };
  status: "granted" | "pending" | "declined" | "not_requested";
};

export type ConsentSource = "sample" | "cloud";

export type UseConsentRequestResult = {
  data: ConsentView | null;
  loading: boolean;
  source: ConsentSource;
  notFound: boolean;
  error: boolean;
};

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function sampleFor(id: string): ConsentView | null {
  const a = sampleAppointments.find((x) => x.id === id);
  if (!a) return null;
  return {
    appointment: {
      id: a.id,
      clientName: a.clientName,
      service: a.service,
      date: a.date,
      afterImage: a.afterImage,
    },
    status:
      a.consent === "granted" || a.consent === "pending" || a.consent === "declined"
        ? a.consent
        : "not_requested",
  };
}

function sampleResult(id: string): UseConsentRequestResult {
  const data = sampleFor(id);
  return {
    data,
    loading: false,
    source: "sample",
    notFound: data === null,
    error: false,
  };
}

async function fetchCloudConsent(id: string): Promise<
  | { kind: "ok"; data: ConsentView }
  | { kind: "not_found" }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  try {
    const res = await api.get(`/appointments/${id}`);
    const appt = res.data.data;
    if (!appt) return { kind: "not_found" };

    return {
      kind: "ok",
      data: {
        appointment: {
          id: appt.id,
          clientName: appt.client?.firstName || "Client",
          service: appt.serviceName,
          date: formatDate(appt.appointmentDate),
        },
        status: (appt.consentStatus || "not_requested") as any,
      },
    };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    if (error.response?.status === 404) return { kind: "not_found" };
    return { kind: "error", message: error.message };
  }
}

export function useConsentRequest(id: string): UseConsentRequestResult {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [state, setState] = useState<UseConsentRequestResult>(() => sampleResult(id));
  const reqId = useRef(0);

  useEffect(() => {
    if (!cloudEnabled) {
      setState(sampleResult(id));
      return;
    }
    const r = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    fetchCloudConsent(id)
      .then((res) => {
        if (r !== reqId.current) return;
        if (res.kind === "ok") {
          setState({ data: res.data, loading: false, source: "cloud", notFound: false, error: false });
        } else if (res.kind === "not_found") {
          setState({ data: null, loading: false, source: "cloud", notFound: true, error: false });
        } else if (res.kind === "anon") {
          setState(sampleResult(id));
        } else {
          // eslint-disable-next-line no-console
          console.warn("[consent] cloud fetch failed, using sample:", res.message);
          setState({ ...sampleResult(id), error: true });
        }
      })
      .catch((err) => {
        if (r !== reqId.current) return;
        // eslint-disable-next-line no-console
        console.warn("[consent] cloud fetch threw, using sample:", err);
        setState({ ...sampleResult(id), error: true });
      });
  }, [cloudEnabled, id]);

  return state;
}
