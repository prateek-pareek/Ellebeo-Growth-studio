import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type CalendarEntry = {
  date: number;
  title: string;
  type: string;
  status: "scheduled" | "draft" | "published" | "rest";
  scheduledFor?: string;
  platform?: string;
  contentItemId?: string;
};

export type UseCalendarResult = {
  entries: CalendarEntry[];
  month: string;
  loading: boolean;
  source: "cloud";
  error: boolean;
  refresh: () => void;
};

function getMonthRange(): { from: string; to: string; label: string } {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const label = now.toLocaleString("default", { month: "long", year: "numeric" });
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    label,
  };
}

function emptyResult(): UseCalendarResult {
  return {
    entries: [],
    month: getMonthRange().label,
    loading: false,
    source: "cloud",
    error: false,
    refresh: () => {},
  };
}

function mapPost(post: any): CalendarEntry {
  const date = new Date(post.scheduledFor);
  return {
    date: date.getDate(),
    title: post.contentItem?.caption?.split(".")[0] ?? "Scheduled post",
    type: post.format ?? "Caption",
    status: post.publishStatus === "published" ? "published" :
            post.publishStatus === "pending" ? "scheduled" : "draft",
    scheduledFor: post.scheduledFor,
    platform: post.platform,
    contentItemId: post.contentItem?.id,
  };
}

async function fetchCalendar(): Promise<
  | { kind: "ok"; entries: CalendarEntry[]; month: string }
  | { kind: "anon" }
  | { kind: "error"; message: string }
> {
  const { from, to, label } = getMonthRange();
  try {
    const res = await api.get("/calendar", { params: { from, to } });
    const posts: any[] = res.data?.posts ?? [];
    return {
      kind: "ok",
      entries: posts.map(mapPost),
      month: label,
    };
  } catch (error: any) {
    if (error.response?.status === 401) return { kind: "anon" };
    return { kind: "error", message: error.message };
  }
}

export function useCalendar(): UseCalendarResult {
  const [state, setState] = useState<UseCalendarResult>({
    entries: [],
    month: getMonthRange().label,
    loading: true,
    source: "cloud",
    error: false,
    refresh: () => {},
  });
  const reqId = useRef(0);

  const load = (id: number) => {
    setState((prev) => ({ ...prev, loading: true }));
    fetchCalendar().then((res) => {
      if (id !== reqId.current) return;
      if (res.kind === "ok") {
        setState({
          entries: res.entries,
          month: res.month,
          loading: false,
          source: "cloud",
          error: false,
          refresh: () => { const nid = ++reqId.current; load(nid); },
        });
      } else {
        setState({
          entries: [],
          month: getMonthRange().label,
          loading: false,
          source: "cloud",
          error: true,
          refresh: () => { const nid = ++reqId.current; load(nid); },
        });
      }
    }).catch(() => {
      if (id !== reqId.current) return;
      setState({
        entries: [],
        month: getMonthRange().label,
        loading: false,
        source: "cloud",
        error: true,
        refresh: () => { const nid = ++reqId.current; load(nid); },
      });
    });
  };

  useEffect(() => {
    const id = ++reqId.current;
    load(id);
  }, []);

  return state;
}
