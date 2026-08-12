import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { BrandDnaV2Contract } from "@/lib/brand-dna/v2-schema";

export type UseBrandDnaV2Result = {
  data: BrandDnaV2Contract | null;
  loading: boolean;
  isEmpty: boolean;
  error: boolean;
  refresh: () => void;
};

export function useBrandDnaV2(): UseBrandDnaV2Result {
  const [tick, setTick] = useState(0);
  const [state, setState] = useState<Omit<UseBrandDnaV2Result, "refresh">>({
    data: null, loading: true, isEmpty: false, error: false,
  });
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    setState((prev) => ({ ...prev, loading: true }));

    api.get("/brand-dna/v2")
      .then((res) => {
        if (id !== reqId.current) return;
        const data = res.data?.data ?? res.data;
        if (data) setState({ data, loading: false, isEmpty: false, error: false });
        else setState({ data: null, loading: false, isEmpty: true, error: false });
      })
      .catch(() => {
        if (id !== reqId.current) return;
        setState({ data: null, loading: false, isEmpty: true, error: true });
      });
  }, [tick]);

  return { ...state, refresh: () => setTick((t) => t + 1) };
}
