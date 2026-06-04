import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type CalendarEntry = {
  date: number;
  title: string;
  type: string;
  status: "scheduled" | "draft" | "published" | "rest";
  scheduledFor?: string;
  platform?: string;
  contentItemId?: string;
  scheduledPostId?: string;
};

export type UseCalendarResult = {
  entries: CalendarEntry[];
  month: string;
  year: number;
  monthIndex: number;
  loading: boolean;
  source: "cloud";
  error: boolean;
  refresh: () => void;
  goNext: () => void;
  goPrev: () => void;
};

function getMonthRange(offset = 0): { from: string; to: string; label: string; year: number; month: number } {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  // Use end of last day to avoid UTC timezone cutting off the final day
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
  const label = from.toLocaleString("default", { month: "long", year: "numeric" });
  return { from: from.toISOString(), to: to.toISOString(), label, year: from.getFullYear(), month: from.getMonth() };
}

function mapPost(post: any): CalendarEntry {
  const date = new Date(post.scheduledFor);
  return {
    date: date.getDate(),
    title: post.contentItem?.caption?.split(".")[0] ?? "Scheduled post",
    type: post.format ?? post.platform ?? "Post",
    status: post.publishStatus === "published" ? "published" : "scheduled",
    scheduledFor: post.scheduledFor,
    platform: post.platform,
    contentItemId: post.contentItem?.id,
    scheduledPostId: post.id,
  };
}

async function fetchCalendar(offset: number): Promise<
  | { kind: "ok"; entries: CalendarEntry[]; label: string; year: number; month: number }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  const { from, to, label, year, month } = getMonthRange(offset);
  try {
    const res = await api.get("/calendar", { params: { from, to } });
    const posts: any[] = res.data?.posts ?? res.data?.data?.posts ?? [];
    return { kind: "ok", entries: posts.map(mapPost), label, year, month };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.message };
  }
}

type CalendarData = {
  entries: CalendarEntry[];
  month: string;
  year: number;
  monthIndex: number;
  loading: boolean;
  error: boolean;
};

export function useCalendar(): UseCalendarResult {
  const [offset, setOffset] = useState(0);
  const initial = getMonthRange(0);

  const [data, setData] = useState<CalendarData>({
    entries: [],
    month: initial.label,
    year: initial.year,
    monthIndex: initial.month,
    loading: true,
    error: false,
  });

  const reqId = useRef(0);
  const offsetRef = useRef(offset);
  offsetRef.current = offset;

  const load = useCallback((id: number, off: number) => {
    setData((prev) => ({ ...prev, loading: true }));
    fetchCalendar(off)
      .then((res) => {
        if (id !== reqId.current) return;
        if (res.kind === "ok") {
          setData({
            entries: res.entries,
            month: res.label,
            year: res.year,
            monthIndex: res.month,
            loading: false,
            error: false,
          });
        } else {
          setData((prev) => ({ ...prev, loading: false, error: true }));
        }
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setData((prev) => ({ ...prev, loading: false, error: true }));
      });
  }, []);

  useEffect(() => {
    const id = ++reqId.current;
    load(id, offset);
  }, [offset, load]);

  const refresh = useCallback(() => {
    const id = ++reqId.current;
    load(id, offsetRef.current);
  }, [load]);
  const goNext = useCallback(() => setOffset((o) => o + 1), []);
  const goPrev = useCallback(() => setOffset((o) => o - 1), []);

  return { ...data, source: "cloud", refresh, goNext, goPrev };
}
