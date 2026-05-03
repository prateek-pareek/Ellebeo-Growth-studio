import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type Template = {
  id: string;
  name: string;
  type: string;
  pillar: string;
  categories: string[];
  preview: string;
  description: string;
};

export type UseTemplatesResult = {
  templates: Template[];
  categories: string[];
  loading: boolean;
  error: boolean;
};

async function fetchTemplates(): Promise<{ templates: Template[], categories: string[] }> {
  try {
    const res = await api.get("/content/templates");
    const data = res.data.data || [];
    
    const templates = data.map((t: any) => ({
      id: t.id,
      name: t.name,
      type: t.format || "Post",
      pillar: t.pillar || "General",
      categories: t.targetCategories || [],
      preview: t.previewImageUrl || "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop",
      description: t.description || "",
    }));

    const categories = Array.from(new Set(templates.flatMap((t: any) => t.categories))) as string[];

    return { templates, categories };
  } catch (error) {
    return { templates: [], categories: [] };
  }
}

export function useTemplates(): UseTemplatesResult {
  const [data, setData] = useState<{ templates: Template[], categories: string[] }>({ templates: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    fetchTemplates().then((res) => {
      if (id !== reqId.current) return;
      setData(res);
      setLoading(false);
    }).catch(() => {
      if (id !== reqId.current) return;
      setError(true);
      setLoading(false);
    });
  }, []);

  return { ...data, loading, error };
}
