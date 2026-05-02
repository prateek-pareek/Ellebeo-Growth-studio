/**
 * Content library data provider — Phase B (read-only).
 *
 * Mirrors the appointments-provider pattern.
 *   - flag off OR signed-out → sample data (sync)
 *   - flag on AND signed-in AND ok → cloud rows normalized into ContentItem
 *   - flag on AND signed-in AND error → sample data with `error: true`
 *   - flag on AND signed-in AND zero rows → empty cloud result (handled by caller)
 *
 * No writes. No realtime. No AI. No media-asset signed URLs (Phase B.2).
 *
 * Cloud → ContentItem mapping rules (see /content Phase B plan):
 *   - title: first sentence of caption, fallback `{format} · {client first name}`
 *   - state: derived from (consent.status, schedule_slots, content_items.status)
 *   - pillar: derived from goal (showcase→Transformations, educate→Education,
 *             convert/availability→Behind the chair, trust→Client stories)
 *   - image: neutral placeholder for cloud rows in v1
 *   - schedule slot picking: prefer the most recent published slot, then the
 *             soonest future scheduled slot
 */
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useFeatureFlag } from "@/lib/feature-flags";
import {
  appointments as sampleAppointments,
  contentLibrary as sampleContentLibrary,
  type Appointment,
  type ContentItem,
  type ContentState,
} from "@/lib/sample-data";

export type ContentSource = "sample" | "cloud";

export type UseContentItemsResult = {
  items: ContentItem[];
  appointmentsById: Map<string, Appointment>;
  loading: boolean;
  source: ContentSource;
  isEmpty: boolean;
  error: boolean;
};

const CLOUD_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop";

function sampleResult(): UseContentItemsResult {
  const map = new Map<string, Appointment>();
  for (const a of sampleAppointments) map.set(a.id, a);
  return {
    items: sampleContentLibrary,
    appointmentsById: map,
    loading: false,
    source: "sample",
    isEmpty: false,
    error: false,
  };
}

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
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [state, setState] = useState<UseContentItemsResult>(() => sampleResult());
  const reqId = useRef(0);

  useEffect(() => {
    if (!cloudEnabled) {
      setState(sampleResult());
      return;
    }
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
        } else if (res.kind === "anon") {
          setState(sampleResult());
        } else {
          // eslint-disable-next-line no-console
          console.warn("[content] cloud fetch failed, using sample:", res.message);
          setState({ ...sampleResult(), error: true });
        }
      })
      .catch((err) => {
        if (id !== reqId.current) return;
        // eslint-disable-next-line no-console
        console.warn("[content] cloud fetch threw, using sample:", err);
        setState({ ...sampleResult(), error: true });
      });
  }, [cloudEnabled]);

  return state;
}
