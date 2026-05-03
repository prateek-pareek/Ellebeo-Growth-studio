import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  window: string;
  posts: number;
  status: string;
  progress: number;
};

export type UseCampaignsResult = {
  data: Campaign[];
  loading: boolean;
  error: boolean;
};

async function fetchCampaigns(): Promise<Campaign[]> {
  try {
    const res = await api.get("/campaigns");
    const data = res.data.data || [];
    return data.map((c: any) => ({
      id: c.id,
      name: c.name,
      goal: c.description || "",
      window: `${new Date(c.startDate).toLocaleDateString()} - ${new Date(c.endDate).toLocaleDateString()}`,
      posts: c.totalPosts || 0,
      status: c.status || "Active",
      progress: (c.completedPosts || 0) / (c.totalPosts || 1),
    }));
  } catch (error) {
    return [];
  }
}

export function useCampaigns(): UseCampaignsResult {
  const [data, setData] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    fetchCampaigns().then((res) => {
      if (id !== reqId.current) return;
      setData(res);
      setLoading(false);
    }).catch(() => {
      if (id !== reqId.current) return;
      setError(true);
      setLoading(false);
    });
  }, []);

  return { data, loading, error };
}
