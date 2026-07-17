import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { useProfile } from "@/lib/providers/profile-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import {
  Camera, LogOut, Instagram,
  CheckCircle2, RefreshCw, Shield,
} from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — Elle.Be.O Growth" },
      { name: "description", content: "Optimise your Elle.Be.O marketplace profile." },
    ],
  }),
  component: ProfilePage,
});


function ProfilePage() {
  const { profile, technician, loading } = useProfile();
  const { logout } = useAuth();
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [avatarUrl, setAvatarUrl] = useState<string>("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (!loading) setAvatarUrl(technician.avatar);
  }, [loading, technician.avatar]);

  const handleLogout = async () => {
    await logout();
    navigate({ to: "/login" });
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await api.post("/auth/upload-avatar", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setAvatarUrl(res.data.data?.url || res.data.url || "");
      toast.success("Profile photo updated.");
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="size-5 border-2 border-taupe/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div>

      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-8 mb-8 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-4">Profile optimisation</p>
          <h1 className="page-title">
            Make your Elle.Be.O profile <span className="italic">work harder</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            Small fixes to your marketplace listing — clearer bio, more photos, better service
            titles — typically lift bookings by 20%+.
          </p>
        </div>

        {/* Technician identity + logout */}
        <div className="flex items-end gap-4">
          <div className="relative group shrink-0">
            <div className="size-14 rounded-full overflow-hidden ring-1 ring-border bg-nude">
              <InitialsAvatar
                name={technician.name}
                imageUrl={avatarUrl || undefined}
                className="size-14"
                textClassName="text-xl"
              />
            </div>
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="absolute inset-0 rounded-full flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/50 transition-colors"
            >
              {uploading
                ? <div className="size-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                : <Camera className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              }
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarUpload}
            />
          </div>
          <div>
            <p className="font-serif text-lg leading-tight">{technician.name}</p>
            <p className="text-xs text-taupe">
              {technician.handle}
              {technician.handle && technician.city && " · "}
              {technician.city}
            </p>
            <button
              onClick={handleLogout}
              className="mt-1.5 text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors flex items-center gap-1"
            >
              <LogOut className="size-2.5" /> Sign out
            </button>
          </div>
        </div>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-10">

        {/* ── Left: Profile strength ────────────────────────────────────── */}
        <section className="col-span-12 lg:col-span-5">
          <h2 className="eyebrow mb-6">Profile strength</h2>
          <div className="artifact p-8">
            <div className="flex items-baseline justify-between mb-3">
              <span className="stat-figure-lg">
                {profile.completion}
                <span className="text-base text-taupe font-sans">%</span>
              </span>
              <span className="text-xs text-taupe uppercase tracking-widest">complete</span>
            </div>
            <div className="h-px bg-border relative mb-6">
              <div
                className="absolute inset-y-0 left-0 bg-foreground"
                style={{ width: `${profile.completion}%` }}
              />
            </div>
            <p className="text-sm text-taupe leading-relaxed">
              {profile.completion >= 80
                ? "Great shape — high search visibility on Elle.Be.O."
                : profile.completion >= 50
                ? "Getting there — a few improvements will lift your ranking."
                : "Needs attention — complete your profile to appear in search."}
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Average rating" value={profile.averageRating.toString()} />
            <Stat label="Reviews" value={profile.reviewsCount.toString()} />
            <Stat label="Avg. reply time" value={`${profile.responseTimeHours}h`} />
            <Stat label="Bio strength" value={profile.bioStrength} />
          </div>
        </section>

        {/* ── Right: Recommended improvements ──────────────────────────── */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Recommended improvements</h2>

          {profile.suggestions.length === 0 ? (
            <div className="artifact p-10 text-center">
              <CheckCircle2 className="size-6 text-sage mx-auto mb-3" />
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">All good</p>
              <p className="text-sm text-taupe">Your profile is in great shape.</p>
            </div>
          ) : (
            <div className="space-y-px bg-border">
              {profile.suggestions.map((s, i) => (
                <div key={i} className="bg-card p-5 flex items-center justify-between gap-4">
                  <p className="text-sm flex-1 leading-snug">{s.label}</p>
                  <span className={
                    "text-[10px] uppercase tracking-widest shrink-0 " +
                    (s.impact === "High" ? "text-foreground" : s.impact === "Medium" ? "text-taupe" : "text-taupe/60")
                  }>
                    {s.impact} impact
                  </span>
                  <Link
                    to={s.link as any}
                    className="text-[10px] uppercase tracking-widest border hairline px-3 py-2 hover:bg-nude/30 transition-colors shrink-0"
                  >
                    Fix
                  </Link>
                </div>
              ))}
            </div>
          )}

          <div className="mt-10 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Services listed" value={`${profile.servicesListed} / ${profile.servicesRecommended}`} />
            <Stat label="Photos uploaded" value={`${profile.photosCount} / ${profile.photosRecommended}`} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/brand"
              className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-nude/30 transition-colors"
            >
              Edit brand profile
            </Link>
            <Link
              to="/appointments"
              className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2 hover:opacity-90 transition-opacity"
            >
              Add photos from appointments
            </Link>
            <Link
              to="/plans"
              className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-nude/30 transition-colors"
            >
              View plans &amp; billing
            </Link>
          </div>
        </section>

        {/* ── Plan ──────────────────────────────────────────────────────── */}
        <section className="col-span-12">
          <h2 className="eyebrow mb-6">Plan &amp; billing</h2>
          <div className="artifact p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
            <div>
              <p className="font-serif text-xl mb-1">Unlock more with a Growth Studio plan.</p>
              <p className="text-sm text-taupe leading-relaxed">
                Compare Starter, Growth, Premium, Premium+ and Publicist tiers — each unlocks more Brand DNA, more content types, and more generations per day.
              </p>
            </div>
            <Link
              to="/plans"
              className="shrink-0 text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-6 py-3 hover:opacity-90 transition-opacity"
            >
              View plans →
            </Link>
          </div>
        </section>

        {/* ── Connected accounts ────────────────────────────────────────── */}
        <section className="col-span-12">
          <ConnectedAccounts />
        </section>

      </div>
    </div>
  );
}

// ─── Stat cell ────────────────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">{label}</p>
      <p className="font-serif text-2xl tabular-nums">{value}</p>
    </div>
  );
}

// ─── Connected accounts ───────────────────────────────────────────────────────

const PLATFORMS: {
  id: "instagram" | "facebook";
  label: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    id: "instagram",
    label: "Instagram",
    note: "Feed, Reels & Stories",
    icon: Instagram,
  },
];

function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [busy,     setBusy]     = useState<string | null>(null);

  const fetchAccounts = useCallback(() => {
    setLoading(true);
    api.get("/social-accounts")
      .then((res) => setAccounts(res.data?.data ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  // Handle OAuth callback: Meta redirects back to /profile?code=...&state=...
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code  = params.get("code");
    const state = params.get("state");
    const error = params.get("error") || params.get("error_code");
    if (!state) return;

    window.history.replaceState({}, "", window.location.pathname);

    let platform = "instagram";
    let mobileRedirectUri = "";
    let isMobile = false;

    try {
      const decodeState = (str: string) => {
        try {
          if (typeof Buffer !== "undefined") {
            return JSON.parse(Buffer.from(str, "base64url").toString());
          }
        } catch {}
        try {
          const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
          return JSON.parse(atob(base64));
        } catch {}
        return null;
      };

      const decoded = decodeState(state);
      if (decoded) {
        if (decoded.platform === "facebook") platform = "facebook";
        // Only the app's own deep link scheme is allowed here — `state` round-trips
        // through the URL unauthenticated, so a `javascript:` URI must be rejected
        // before it can ever reach window.location.href.
        if (decoded.mobileRedirectUri && /^elleobe:\/\//i.test(decoded.mobileRedirectUri)) {
          mobileRedirectUri = decoded.mobileRedirectUri;
          isMobile = true;
        }
      }
    } catch {}

    if (error || !code) {
      if (isMobile && mobileRedirectUri) {
        window.location.href = `${mobileRedirectUri}?error=${platform}_denied`;
      }
      return;
    }

    api.post(`/social-accounts/connect/${platform}/exchange`, { code, state })
      .then(() => {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected!`);
        fetchAccounts();
        if (isMobile && mobileRedirectUri) {
          window.location.href = `${mobileRedirectUri}?connected=${platform}`;
        }
      })
      .catch(() => {
        toast.error("Connection failed. Try again.");
        if (isMobile && mobileRedirectUri) {
          window.location.href = `${mobileRedirectUri}?error=${platform}_connect_failed`;
        }
      });
  }, [fetchAccounts]);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const getRedirectUri = () => {
    if (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1") {
      return (import.meta.env.VITE_OAUTH_REDIRECT_URI as string) || `${window.location.origin}/profile`;
    }
    return `${window.location.origin}/profile`;
  };

  const handleConnect = async (platform: string) => {
    setBusy(platform);
    try {
      const redirectUri = getRedirectUri();
      const res = await api.post(`/social-accounts/connect/${platform}`, { redirectUri });
      const redirectUrl = res.data?.redirectUrl ?? res.data?.data?.redirectUrl;
      if (redirectUrl) {
        window.location.href = redirectUrl;
      } else {
        toast.error("Could not get OAuth URL. Try again.");
        setBusy(null);
      }
    } catch {
      toast.error("Connection failed. Try again.");
      setBusy(null);
    }
  };

  const handleDisconnect = async (id: string, platform: string) => {
    setBusy(id);
    try {
      await api.delete(`/social-accounts/${id}`);
      toast.success(`${platform} disconnected`);
      fetchAccounts();
    } catch {
      toast.error("Disconnect failed. Try again.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      <h2 className="eyebrow mb-6">Connected accounts</h2>
      <div className="border hairline">
        <div className="space-y-px bg-border">
          {PLATFORMS.map((p) => {
            const account = accounts.find((a) => a.platform === p.id && a.status === "connected");
            const isBusy  = busy === p.id || busy === account?.id;
            const Icon    = p.icon;

            return (
              <div key={p.id} className="bg-card p-5 flex items-center gap-5">
                {/* Platform icon */}
                <div className={`shrink-0 size-10 flex items-center justify-center border hairline ${
                  account ? "bg-foreground border-foreground" : "bg-card"
                }`}>
                  <Icon className={`size-4 ${account ? "text-offwhite" : "text-taupe"}`} />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium leading-none">{p.label}</p>
                  <p className="text-[10px] text-taupe mt-1 truncate">
                    {account ? (account.accountHandle ?? account.accountName ?? "Connected") : p.note}
                  </p>
                </div>

                {/* Action */}
                <div className="shrink-0 flex items-center gap-4">
                  {account ? (
                    <>
                      <span className="text-[10px] uppercase tracking-widest text-sage">Connected</span>
                      <button
                        type="button"
                        onClick={() => handleDisconnect(account.id, p.label)}
                        disabled={isBusy}
                        className="text-[10px] uppercase tracking-widest text-taupe hover:text-destructive transition-colors border hairline px-3 py-2 disabled:opacity-40 flex items-center gap-1.5"
                      >
                        {isBusy ? <RefreshCw className="size-3 animate-spin" /> : "Remove"}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleConnect(p.id)}
                      disabled={isBusy || loading}
                      className="text-[10px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2 hover:opacity-90 transition-opacity disabled:opacity-40 flex items-center gap-2"
                    >
                      {isBusy
                        ? <><RefreshCw className="size-3 animate-spin" /> Connecting…</>
                        : "Connect"
                      }
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="bg-card border-t hairline px-5 py-3">
          <p className="text-[9px] text-taupe/60 flex items-center gap-1.5">
            <Shield className="size-2.5 shrink-0" />
            Tokens are encrypted and stored securely. We never post without your approval.
          </p>
        </div>
      </div>
    </>
  );
}
