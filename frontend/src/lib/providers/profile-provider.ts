import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";

export type ProfileData = {
  completion: number;
  averageRating: number;
  reviewsCount: number;
  responseTimeHours: number;
  bioStrength: string;
  servicesListed: number;
  servicesRecommended: number;
  photosCount: number;
  photosRecommended: number;
  suggestions: Array<{ label: string; impact: string; link: string }>;
};

export type TechnicianData = {
  name: string;
  handle: string;
  city: string;
  avatar: string;
  hasGrowthStudioAccess: boolean;
};

export type UseProfileResult = {
  profile: ProfileData;
  technician: TechnicianData;
  loading: boolean;
};

const DEFAULT_PROFILE: ProfileData = {
  completion: 0,
  averageRating: 0,
  reviewsCount: 0,
  responseTimeHours: 0,
  bioStrength: "Weak",
  servicesListed: 0,
  servicesRecommended: 10,
  photosCount: 0,
  photosRecommended: 20,
  suggestions: [],
};

const DEFAULT_TECH: TechnicianData = {
  name: "Technician",
  handle: "@handle",
  city: "Unknown",
  avatar: "",
  hasGrowthStudioAccess: false,
};

async function fetchProfile(): Promise<{ profile: ProfileData, technician: TechnicianData }> {
  try {
    const res = await api.get("/auth/me");
    const u = res.data.data;

    return {
      profile: {
        completion: u.profileCompletion ?? 0,
        averageRating: u.averageRating ?? 0,
        reviewsCount: u.reviewsCount ?? 0,
        responseTimeHours: u.responseTimeHours ?? 0,
        bioStrength: u.bioStrength ?? "Weak",
        servicesListed: u.servicesCount ?? 0,
        servicesRecommended: u.servicesRecommended ?? 10,
        photosCount: u.photosCount ?? 0,
        photosRecommended: u.photosRecommended ?? 20,
        suggestions: u.suggestions ?? [],
      },
      technician: {
        name: u.displayName || u.tenant?.businessName || "Technician",
        handle: u.handle || "@technician",
        city: u.city || "Unknown",
        avatar: u.avatarUrl || DEFAULT_TECH.avatar,
        hasGrowthStudioAccess: u.tenant?.hasGrowthStudioAccess || false,
      },
    };
  } catch (error) {
    return { profile: DEFAULT_PROFILE, technician: DEFAULT_TECH };
  }
}

export function useProfile(): UseProfileResult {
  const [data, setData] = useState({ profile: DEFAULT_PROFILE, technician: DEFAULT_TECH });
  const [loading, setLoading] = useState(true);
  const reqId = useRef(0);

  useEffect(() => {
    const id = ++reqId.current;
    fetchProfile().then((res) => {
      if (id !== reqId.current) return;
      setData(res);
      setLoading(false);
    });
  }, []);

  return { ...data, loading };
}
