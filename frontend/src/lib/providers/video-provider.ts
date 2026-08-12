import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type VideoSceneAsset = {
  kind: "image" | "video" | "generated_clip" | "stock";
  assetId: string | null;
  url: string | null;
  prompt: string | null;
};

export type VideoScene = {
  index: number;
  durationSeconds: number;
  asset: VideoSceneAsset;
  motion: "ken_burns" | "none" | "slide";
  text: { headline: string | null; caption: string | null; position: "top" | "center" | "bottom" };
  transitionOut: "fade" | "cut" | "slide";
};

export type VideoPlanContract = {
  planVersion: number;
  videoType: "slideshow" | "reels" | "ai_clips";
  aspect: "9:16";
  durationSeconds: number;
  objective: string;
  scenes: VideoScene[];
  audio: {
    voiceover: { enabled: boolean; script: string | null; voiceId: string | null; assetUrl: string | null };
    music: { trackId: string | null; mood: string | null; volume: number };
  };
  captions: { enabled: boolean; style: "bold" | "minimal"; burnedIn: boolean };
  critic: { score: number | null; status: string; passed: boolean; revisions: number; notes: string[] };
  status: string;
  render: { provider: string; renderId: string | null; outputUrl: string | null };
};

export type VideoPlanRow = {
  id: string;
  videoType: string;
  status: string;
  criticStatus: string;
  criticScore: number | null;
  criticRevisions: number;
  outputUrl: string | null;
  errorMessage: string | null;
  durationSeconds: number;
  createdAt: string;
  updatedAt: string;
  plan: VideoPlanContract;
};

export type UseVideoPlansResult = {
  items: VideoPlanRow[];
  loading: boolean;
  isEmpty: boolean;
  error: boolean;
  refresh: () => void;
};

async function fetchVideoPlans(status?: string): Promise<
  { kind: "ok"; items: VideoPlanRow[] } | { kind: "empty" } | { kind: "error" }
> {
  try {
    const res = await api.get("/video-plans", { params: status ? { status } : {} });
    const raw = res.data.data;
    const data: VideoPlanRow[] = Array.isArray(raw) ? raw : (raw?.data ?? []);
    if (data.length === 0) return { kind: "empty" };
    return { kind: "ok", items: data };
  } catch {
    return { kind: "error" };
  }
}

export function useVideoPlans(status?: string): UseVideoPlansResult {
  const [state, setState] = useState<UseVideoPlansResult>({ items: [], loading: true, isEmpty: false, error: false, refresh: () => {} });
  const reqId = useRef(0);

  const load = () => {
    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));
    fetchVideoPlans(status).then((res) => {
      if (id !== reqId.current) return;
      if (res.kind === "ok") setState({ items: res.items, loading: false, isEmpty: false, error: false, refresh: load });
      else if (res.kind === "empty") setState({ items: [], loading: false, isEmpty: true, error: false, refresh: load });
      else setState({ items: [], loading: false, isEmpty: true, error: true, refresh: load });
    });
  };

  useEffect(load, [status]);

  return state;
}

export async function updateVideoPlan(id: string, dto: {
  sceneOrder?: number[];
  scenes?: Array<{ index: number; headline?: string | null; caption?: string | null; assetUrl?: string }>;
  voiceoverEnabled?: boolean;
  musicMood?: string | null;
}) {
  const res = await api.patch(`/video-plans/${id}`, dto);
  return res.data.data as VideoPlanRow;
}

export async function approveVideoPlan(id: string) {
  const res = await api.post(`/video-plans/${id}/approve`);
  return res.data.data as VideoPlanRow;
}
