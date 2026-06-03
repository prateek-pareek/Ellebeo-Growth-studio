import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { useProfile } from "@/lib/providers/profile-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { LogOut, Camera } from "lucide-react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile optimisation — Elle.Be.O Growth" },
      { name: "description", content: "Optimise your Elle.Be.O marketplace profile to attract more bookings." },
      { property: "og:title", content: "Profile — Elle.Be.O Growth" },
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
      const url = res.data.data?.url || res.data.url || "";
      setAvatarUrl(url);
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
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic">
        Loading profile data...
      </div>
    );
  }

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 flex flex-wrap items-end justify-between gap-6">
        <div className="max-w-[60ch]">
          <p className="eyebrow mb-5">Profile optimisation</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Make your Elle.Be.O profile <span className="italic">work harder</span>.
          </h1>
          <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
            Small fixes to your marketplace listing — clearer bio, more photos, better service titles — typically lift bookings by 20%+.
          </p>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-3">
            {/* Avatar with upload overlay */}
            <div className="relative shrink-0 group">
              <InitialsAvatar
                name={technician.name}
                imageUrl={avatarUrl || undefined}
                className="size-14 ring-1 ring-border"
                textClassName="text-xl"
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/40 transition-colors disabled:cursor-not-allowed"
                title="Change profile photo"
              >
                {uploading ? (
                  <span className="text-[9px] text-white opacity-0 group-hover:opacity-100">…</span>
                ) : (
                  <Camera className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                )}
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
              <p className="text-xs text-taupe">{technician.handle} · {technician.city}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mt-0.5 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground flex items-center gap-2 border hairline px-4 py-3 transition-colors"
          >
            <LogOut className="size-3" />
            Sign out
          </button>
        </div>
      </header>

      <ConnectedAccounts />

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Completion */}
        <section className="col-span-12 lg:col-span-5">
          <h2 className="eyebrow mb-6">Profile strength</h2>
          <div className="artifact p-8">
            <div className="flex items-baseline justify-between mb-3">
              <span className="font-serif text-5xl tabular-nums">{profile.completion}%</span>
              <span className="text-xs text-taupe uppercase tracking-widest">complete</span>
            </div>
            <div className="h-px bg-border relative mb-6">
              <div className="absolute inset-y-0 left-0 bg-foreground" style={{ width: `${profile.completion}%` }} />
            </div>
            <p className="text-sm text-taupe leading-relaxed">
              Profiles above 90% appear higher in Elle.Be.O search and convert roughly twice as often.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Average rating" value={profile.averageRating.toString()} />
            <Stat label="Reviews" value={profile.reviewsCount.toString()} />
            <Stat label="Avg. reply time" value={`${profile.responseTimeHours}h`} />
            <Stat label="Bio strength" value={profile.bioStrength} />
          </div>
        </section>

        {/* Suggestions */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-6">Recommended improvements</h2>
          <div className="space-y-px bg-border">
            {profile.suggestions.length === 0 ? (
              <div className="bg-card p-10 text-center text-taupe italic text-sm">
                Your profile is in great shape! No immediate improvements recommended.
              </div>
            ) : profile.suggestions.map((s, i) => (
              <div key={i} className="bg-card p-5 flex items-center justify-between gap-4">
                <p className="text-sm flex-1">{s.label}</p>
                <span
                  className={
                    "text-[10px] uppercase tracking-widest flex-shrink-0 " +
                    (s.impact === "High" ? "text-foreground" : s.impact === "Medium" ? "text-taupe" : "text-taupe/60")
                  }
                >
                  {s.impact} impact
                </span>
                <Link
                  to={s.link as any}
                  className="text-[10px] uppercase tracking-widest border hairline px-3 py-2 hover:bg-nude/30 flex-shrink-0"
                >
                  Fix
                </Link>
              </div>
            ))}
          </div>

          <div className="mt-10 grid grid-cols-2 gap-px bg-border border hairline">
            <Stat label="Services listed" value={`${profile.servicesListed} / ${profile.servicesRecommended}`} />
            <Stat label="Photos uploaded" value={`${profile.photosCount} / ${profile.photosRecommended}`} />
          </div>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/brand" className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card">
              Edit brand profile
            </Link>
            <Link to="/appointments" className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2">
              Add new photos from appointments
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

const PLATFORMS: { id: "instagram" | "facebook" | "tiktok"; label: string; note: string }[] = [
  { id: "instagram", label: "Instagram", note: "Feed, Reels & Stories" },
  { id: "facebook", label: "Facebook", note: "Page posts & Stories" },
  { id: "tiktok", label: "TikTok", note: "Coming soon", },
];

function ConnectedAccounts() {
  const [accounts, setAccounts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const fetchAccounts = useCallback(() => {
    setLoading(true);
    api.get("/social-accounts")
      .then((res) => setAccounts(res.data?.data ?? res.data ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleConnect = async (platform: "instagram" | "facebook") => {
    setBusy(platform);
    try {
      // Use the OAuth callback with a mock code until real OAuth is wired up
      await api.get(`/social-accounts/connect/${platform}/callback`, {
        params: { code: "mock_connect" },
      });
      toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected`);
      fetchAccounts();
    } catch {
      toast.error("Connection failed. Try again.");
    } finally {
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
    <section className="mb-12">
      <div className="flex items-baseline justify-between mb-6">
        <h2 className="eyebrow">Connected accounts</h2>
        {!loading && accounts.filter((a) => a.status === "connected").length > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-sage">
            {accounts.filter((a) => a.status === "connected").length} connected
          </span>
        )}
      </div>
      <p className="text-sm text-taupe mb-6 max-w-[56ch]">
        Connect your social accounts to publish content directly from the calendar.
      </p>
      <div className="space-y-px bg-border border hairline">
        {PLATFORMS.map((p) => {
          const account = accounts.find((a) => a.platform === p.id && a.status === "connected");
          const isBusy = busy === p.id || busy === account?.id;
          const isComingSoon = p.id === "tiktok";

          return (
            <div key={p.id} className="bg-card px-6 py-5 flex items-center gap-5">
              {/* Platform label */}
              <div className="w-28 shrink-0">
                <p className="text-sm font-medium">{p.label}</p>
                <p className="text-[10px] text-taupe mt-0.5">{p.note}</p>
              </div>

              {/* Account info */}
              <div className="flex-1 min-w-0">
                {account ? (
                  <div className="flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-sage shrink-0" />
                    <span className="text-sm truncate">{account.accountName}</span>
                  </div>
                ) : (
                  <span className="text-sm text-taupe italic">
                    {isComingSoon ? "Not available yet" : "Not connected"}
                  </span>
                )}
              </div>

              {/* Status + action */}
              <div className="flex items-center gap-3 shrink-0">
                {account ? (
                  <>
                    <span className="text-[9px] uppercase tracking-widest text-sage px-2 py-1 bg-sage/10">
                      Connected
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id, p.label)}
                      disabled={isBusy}
                      className="text-[10px] uppercase tracking-widest text-destructive border border-destructive/30 px-3 py-1.5 hover:bg-destructive/5 disabled:opacity-40 transition-colors"
                    >
                      {isBusy ? "…" : "Disconnect"}
                    </button>
                  </>
                ) : isComingSoon ? (
                  <span className="text-[10px] uppercase tracking-widest text-taupe/50 border hairline px-3 py-1.5 opacity-50">
                    Soon
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(p.id)}
                    disabled={isBusy || loading}
                    className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-4 py-1.5 hover:bg-taupe disabled:opacity-40 transition-colors"
                  >
                    {isBusy ? "Connecting…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card p-5">
      <p className="text-[10px] uppercase tracking-widest text-taupe mb-2">{label}</p>
      <p className="font-serif text-2xl tabular-nums">{value}</p>
    </div>
  );
}
