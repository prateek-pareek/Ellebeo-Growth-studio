import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type ContentState = "draft" | "scheduled" | "published" | "Needs review" | "Scheduled" | "Published";

export type ContentItem = {
  id: string;
  title: string;
  type: "Post" | "Story" | "Reel" | "Caption";
  pillar: string;
  category: string;
  status: string;
  state: string;
  goal: string;
  image: string;
  caption: string;
  cta?: string;
  hashtags?: string[];
  scheduledFor?: string;
  postedAt?: string;
  qualityScore?: number;
  sourceAppointmentId?: string;
  updatedAt: string;
};

export type Appointment = {
  id: string;
  clientName: string;
  service: string;
  category: string;
  date: string;
  hasBefore: boolean;
  hasAfter: boolean;
  consent: string;
  contentReady: number;
};

export type UseContentItemsResult = {
  items: ContentItem[];
  appointmentsById: Map<string, Appointment>;
  loading: boolean;
  source: "cloud";
  isEmpty: boolean;
  error: boolean;
};

const CLOUD_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop";

function mapRow(row: any): { item: ContentItem; appointment: Appointment | null } {
  const item: ContentItem = {
    id: row.id,
    title: row.caption ? row.caption.split('.')[0] : "New Content",
    type: (row.postFormat || "Caption") as any,
    pillar: "General",
    category: row.category || "Skin therapist",
    status: row.status === 'draft' ? 'Needs review' : (row.status === 'scheduled' ? 'Scheduled' : 'Published'),
    state: row.status as any,
    goal: row.goal || "showcase",
    image: row.processedImageUrlFeed || CLOUD_PLACEHOLDER_IMAGE,
    caption: row.caption || "",
    cta: row.callToAction || "",
    hashtags: row.hashtags || [],
    scheduledFor: row.scheduledAt,
    postedAt: row.publishedAt,
    qualityScore: row.qualityScore,
    sourceAppointmentId: row.appointmentId,
    updatedAt: "Just now",
  };

  let appointment: Appointment | null = null;
  if (row.appointment) {
    appointment = {
      id: row.appointment.id,
      clientName: row.appointment.client?.firstName || "Client",
      service: row.appointment.serviceName,
      category: row.appointment.serviceCategory as any,
      date: row.appointment.appointmentDate,
      hasBefore: false,
      hasAfter: false,
      consent: "granted",
      contentReady: 0,
    };
  }

  return { item, appointment };
}

async function fetchCloudContent(): Promise<
  | { kind: "ok"; items: ContentItem[]; appointmentsById: Map<string, Appointment> }
  | { kind: "empty" }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  try {
    const res = await api.get('/content');
    const data = res.data.data;
    
    if (!data || data.length === 0) return { kind: "empty" };

    const appointmentsById = new Map<string, Appointment>();
    const items: ContentItem[] = [];
    for (const row of data) {
      const { item, appointment } = mapRow(row);
      items.push(item);
      if (appointment && !appointmentsById.has(appointment.id)) {
        appointmentsById.set(appointment.id, appointment);
      }
    }
    return { kind: "ok", items, appointmentsById };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.message };
  }
}

export function useContentItems(): UseContentItemsResult {
  const [state, setState] = useState<UseContentItemsResult>({
    items: [],
    appointmentsById: new Map(),
    loading: true,
    source: "cloud",
    isEmpty: false,
    error: false,
  });
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    fetchCloudContent()
      .then((res) => {
        if (id !== reqId.current) return;
        if (res.kind === "ok") {
          setState({
            items: res.items,
            appointmentsById: res.appointmentsById,
            loading: false,
            source: "cloud",
            isEmpty: false,
            error: false,
          });
        } else if (res.kind === "empty") {
          setState({
            items: [],
            appointmentsById: new Map(),
            loading: false,
            source: "cloud",
            isEmpty: true,
            error: false,
          });
        } else {
          setState({
            items: [],
            appointmentsById: new Map(),
            loading: false,
            source: "cloud",
            isEmpty: true,
            error: true,
          });
        }
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setState({
          items: [],
          appointmentsById: new Map(),
          loading: false,
          source: "cloud",
          isEmpty: true,
          error: true,
        });
      });
  }, []);

  return state;
}
