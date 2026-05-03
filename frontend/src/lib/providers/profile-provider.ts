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
  suggestions: Array<{ label: string; impact: string }>;
};

export type TechnicianData = {
  name: string;
  handle: string;
  city: string;
  avatar: string;
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
  avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop",
};

async function fetchProfile(): Promise<{ profile: ProfileData, technician: TechnicianData }> {
  try {
    const res = await api.get("/auth/me");
    const user = res.data.data;
    
    // In a real app, this would come from multiple endpoints or a rich user object
    return {
      profile: {
        ...DEFAULT_PROFILE,
        completion: user.profileCompletion || 45,
        servicesListed: user.servicesCount || 0,
        photosCount: user.photosCount || 0,
        suggestions: [
          { label: "Add more service photos from recent appointments", impact: "High" },
          { label: "Update your business one-liner to be more specific", impact: "Medium" }
        ]
      },
      technician: {
        name: `${user.firstName} ${user.lastName}`,
        handle: `@${user.firstName.toLowerCase()}`,
        city: user.city || "London",
        avatar: user.avatarUrl || DEFAULT_TECH.avatar,
      }
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
