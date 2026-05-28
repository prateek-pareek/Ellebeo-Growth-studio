import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type Category =
  | "Hairdresser"
  | "Colourist"
  | "Bridal makeup"
  | "Lash & brow"
  | "Nail artist"
  | "Injector"
  | "Skin therapist"
  | "Barber";

export type Appointment = {
  id: string;
  clientName: string;
  service: string;
  category: Category;
  date: string;
  hasBefore: boolean;
  hasAfter: boolean;
  beforePhotoUrl: string | null;
  afterPhotoUrl: string | null;
  consent: "granted" | "pending" | "declined" | "not_requested";
  notes?: string;
  contentReady: number;
};

export type UseAppointmentsResult = {
  data: Appointment[];
  loading: boolean;
  source: "cloud";
  isEmpty: boolean;
  error: boolean;
  refresh?: () => void;
};

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
        hasBefore: !!row.beforePhotoUrl,
        hasAfter: !!row.afterPhotoUrl,
        beforePhotoUrl: row.beforePhotoUrl ?? null,
        afterPhotoUrl: row.afterPhotoUrl ?? null,
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
  const [state, setState] = useState<UseAppointmentsResult>({
    data: [],
    loading: true,
    source: "cloud",
    isEmpty: false,
    error: false,
  });
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
        } else {
          setState({ data: [], loading: false, source: "cloud", isEmpty: true, error: true });
        }
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setState({ data: [], loading: false, source: "cloud", isEmpty: true, error: true });
      });
  };

  useEffect(() => {
    const id = ++reqId.current;
    fetch(id);
  }, []);

  return { 
    ...state, 
    refresh: () => {
      const id = ++reqId.current;
      fetch(id);
    } 
  };
}
