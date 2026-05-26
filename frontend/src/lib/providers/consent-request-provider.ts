import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type ConsentPermissions = {
  allowShowFace: boolean;
  allowUseName: boolean;
  allowTagSocial: boolean;
  allowPlatformPromotion: boolean;
  allowMarketingContent: boolean;
  allowInternalUse: boolean;
};

export type ConsentView = {
  appointment: {
    id: string;
    clientName: string;
    service: string;
    date: string;
    afterImage?: string;
    beforePhotoUrl?: string | null;
    afterPhotoUrl?: string | null;
  };
  status: "granted" | "pending" | "declined" | "not_requested";
  permissions: ConsentPermissions;
};

export type UseConsentRequestResult = {
  data: ConsentView | null;
  loading: boolean;
  source: "cloud";
  notFound: boolean;
  error: boolean;
};

function formatDate(date: string): string {
  const d = new Date(date);
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
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

    const cr = appt.consentRecord;
    return {
      kind: "ok",
      data: {
        appointment: {
          id: appt.id,
          clientName: appt.clientName || appt.client?.firstName || "Client",
          service: appt.serviceName,
          date: formatDate(appt.appointmentDate),
          beforePhotoUrl: appt.beforePhotoUrl ?? null,
          afterPhotoUrl: appt.afterPhotoUrl ?? null,
        },
        status: (appt.consentStatus || "not_requested") as any,
        permissions: {
          allowShowFace: cr?.allowShowFace ?? false,
          allowUseName: cr?.allowUseName ?? false,
          allowTagSocial: cr?.allowTagSocial ?? false,
          allowPlatformPromotion: cr?.allowPlatformPromotion ?? false,
          allowMarketingContent: cr?.allowMarketingContent ?? false,
          allowInternalUse: cr?.allowInternalUse ?? false,
        },
      },
    };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    if (error.response?.status === 404) return { kind: "not_found" };
    return { kind: "error", message: error.message };
  }
}

export function useConsentRequest(id: string): UseConsentRequestResult {
  const [state, setState] = useState<UseConsentRequestResult>({
    data: null,
    loading: true,
    source: "cloud",
    notFound: false,
    error: false,
  });
  const reqId = useRef(0);

  useEffect(() => {
    const r = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    fetchCloudConsent(id)
      .then((res) => {
        if (r !== reqId.current) return;
        if (res.kind === "ok") {
          setState({ data: res.data, loading: false, source: "cloud", notFound: false, error: false });
        } else if (res.kind === "not_found") {
          setState({ data: null, loading: false, source: "cloud", notFound: true, error: false });
        } else {
          setState({ data: null, loading: false, source: "cloud", notFound: true, error: true });
        }
      })
      .catch(() => {
        if (r !== reqId.current) return;
        setState({ data: null, loading: false, source: "cloud", notFound: true, error: true });
      });
  }, [id]);

  return state;
}
