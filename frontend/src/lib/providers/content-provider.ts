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
  refresh?: () => void;
};

const CLOUD_PLACEHOLDER_IMAGE =
  "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop";

function mapStatus(status: string): string {
  if (status === 'draft') return 'Needs review';
  if (status === 'approved') return 'Approved';
  if (status === 'scheduled') return 'Scheduled';
  if (status === 'published') return 'Published';
  return 'Needs review';
}

const GOAL_REVERSE_MAP: Record<string, string> = {
  attract_new_clients: "showcase",
  build_brand_authority: "educate",
  promote_high_margin_services: "convert",
  fill_quiet_days: "availability",
  retain_existing_clients: "trust",
  launch_new_service: "showcase",
  seasonal_promotion: "availability",
};

const FORMAT_MAP: Record<string, string> = {
  carousel: "Carousel", reel: "Reel", story: "Story",
  caption: "Caption", tiktok: "TikTok", post: "Post",
};

function normalizeFormat(fmt: string): string {
  return FORMAT_MAP[fmt?.toLowerCase()] ?? fmt ?? "Caption";
}

function mapRow(row: any): { item: ContentItem; appointment: Appointment | null } {
  const apt = row.appointment;
  const clientName = apt?.client
    ? `${apt.client.firstName || ''} ${apt.client.lastName || ''}`.trim() || 'Client'
    : 'Client';

  const item: ContentItem = {
    id: row.id,
    title: row.caption ? row.caption.slice(0, 60).split(/[.!?]/)[0] || 'New Content' : 'New Content',
    type: normalizeFormat(row.postFormat || apt?.serviceCategory || 'Caption') as any,
    pillar: 'General',
    category: apt?.serviceCategory || 'general',
    status: mapStatus(row.status),
    state: row.status || 'draft',
    goal: (row.goal ? (GOAL_REVERSE_MAP[row.goal] ?? row.goal) : 'showcase'),
    image: row.processedImageUrlFeed || CLOUD_PLACEHOLDER_IMAGE,
    caption: row.caption || '',
    cta: row.callToAction || '',
    hashtags: row.hashtags || [],
    scheduledFor: row.scheduledAt,
    postedAt: row.publishedAt,
    qualityScore: row.confidenceScore,
    sourceAppointmentId: row.appointmentId,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Recently',
  };

  let appointment: Appointment | null = null;
  if (apt) {
    appointment = {
      id: row.appointmentId,
      clientName,
      service: apt.serviceName || '',
      category: apt.serviceCategory || 'general',
      date: apt.appointmentDate,
      hasBefore: false,
      hasAfter: false,
      consent: 'granted',
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
    // Backend returns array directly; ResponseInterceptor wraps it as res.data.data
    const raw = res.data.data;
    const data: any[] = Array.isArray(raw) ? raw : (raw?.data ?? []);

    if (data.length === 0) return { kind: "empty" };

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

  const refresh = () => {
    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));
    fetchCloudContent().then((res) => {
      if (id !== reqId.current) return;
      if (res.kind === "ok") {
        setState({ items: res.items, appointmentsById: res.appointmentsById, loading: false, source: "cloud", isEmpty: false, error: false });
      } else {
        setState((prev) => ({ ...prev, loading: false }));
      }
    }).catch(() => setState((prev) => ({ ...prev, loading: false })));
  };

  return { ...state, refresh };
}
