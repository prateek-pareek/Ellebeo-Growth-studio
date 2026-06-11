import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { useProfile } from "@/lib/providers/profile-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import { Camera, LogOut } from "lucide-react";
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
      <div className="flex min-h-[60vh] items-center justify-center text-taupe italic text-sm">
        Loading profile data…
      </div>
    );
  }

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="relative mt-6 lg:mt-10 mb-10 overflow-hidden border border-nude/60 bg-card shadow-sm">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-taupe via-sage to-sage opacity-90"
          aria-hidden
        />
        <div className="pl-5 pr-6 py-6 sm:py-8 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
          {/* Left — identity */}
          <div className="lg:col-span-7 flex items-center gap-5">
            {/* Avatar */}
            <div className="relative shrink-0 group">
              <InitialsAvatar
                name={technician.name}
                imageUrl={avatarUrl || undefined}
                className="size-16 ring-1 ring-border"
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
                  <span className="text-white text-[9px] opacity-0 group-hover:opacity-100">…</span>
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
              <p className="eyebrow mb-1">Profile optimisation</p>
              <p className="font-serif text-2xl sm:text-3xl leading-tight">{technician.name}</p>
              <p className="text-xs text-taupe mt-0.5">{technician.handle} · {technician.city}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mt-1 disabled:opacity-50"
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
            </div>
          </div>

          {/* Right — headline + sign-out */}
          <div className="lg:col-span-5">
            <p className="font-serif text-xl sm:text-2xl leading-snug text-taupe mb-4">
              Small fixes to your listing typically lift bookings by{" "}
              <span className="text-foreground not-italic">20%+</span>.
            </p>
            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
            >
              <LogOut className="size-3" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Notification settings ─────────────────────────────────────────── */}
      <NotificationSettings />

      {/* ── Connected accounts ───────────────────────────────────────────── */}
      <ConnectedAccounts />

      {/* ── Profile strength + recommendations ───────────────────────────── */}
      <div className="grid grid-cols-12 gap-8 lg:gap-10">
        {/* Left — completion */}
        <section className="col-span-12 lg:col-span-5">
          <div className="border border-border bg-card shadow-sm overflow-hidden mb-6">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Profile strength
              </h2>
            </div>
            <div className="p-6">
              <div className="flex items-baseline justify-between mb-3">
                <span className="font-serif text-5xl tabular-nums">{profile.completion}%</span>
                <span className="text-xs text-taupe uppercase tracking-widest">complete</span>
              </div>
              <div className="h-1.5 bg-border relative mb-5 overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-foreground transition-all duration-700"
                  style={{ width: `${profile.completion}%` }}
                />
              </div>
              <p className="text-sm text-taupe leading-relaxed">
                Profiles above 90% appear higher in Elle.Be.O search and convert roughly twice as often.
              </p>
            </div>
          </div>

          {/* Key stats */}
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Key metrics
              </h2>
            </div>
            <div className="grid grid-cols-2 divide-y divide-border">
              <div className="divide-x divide-border flex">
                <StatCell label="Avg. rating"    value={profile.averageRating.toString()} />
                <StatCell label="Reviews"        value={profile.reviewsCount.toString()} />
              </div>
              <div className="divide-x divide-border flex">
                <StatCell label="Avg. reply"     value={`${profile.responseTimeHours}h`} />
                <StatCell label="Bio strength"   value={profile.bioStrength} />
              </div>
              <div className="divide-x divide-border flex col-span-2">
                <StatCell label="Services listed" value={`${profile.servicesListed} / ${profile.servicesRecommended}`} />
                <StatCell label="Photos uploaded" value={`${profile.photosCount} / ${profile.photosRecommended}`} />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              to="/brand"
              className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
            >
              Edit brand profile
            </Link>
            <Link
              to="/appointments"
              className="inline-flex items-center gap-1.5 bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
            >
              Add photos from appointments
            </Link>
          </div>
        </section>

        {/* Right — recommendations */}
        <section className="col-span-12 lg:col-span-7">
          <div className="border border-border bg-card shadow-sm overflow-hidden">
            <div className="bg-muted px-5 py-3 border-b border-border">
              <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Recommended improvements
              </h2>
            </div>
            {profile.suggestions.length === 0 ? (
              <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-12 text-center bg-muted/20">
                <p className="eyebrow mb-2">All good</p>
                <p className="text-sm text-taupe">
                  Your profile is in great shape — no immediate improvements recommended.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm" style={{ minWidth: "480px" }}>
                  <thead className="bg-muted border-b border-border text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    <tr>
                      <th className="px-5 py-3">#</th>
                      <th className="px-5 py-3">Improvement</th>
                      <th className="px-5 py-3 w-[100px]">Impact</th>
                      <th className="px-5 py-3 w-[80px] text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {profile.suggestions.map((s, i) => (
                      <tr key={i} className="hover:bg-nude/20 transition-colors">
                        <td className="px-5 py-4 text-taupe/60 text-xs tabular-nums">{i + 1}</td>
                        <td className="px-5 py-4 text-sm">{s.label}</td>
                        <td className="px-5 py-4">
                          <span className={
                            "text-[10px] uppercase tracking-widest px-2 py-0.5 " +
                            (s.impact === "High"
                              ? "bg-foreground text-offwhite"
                              : s.impact === "Medium"
                                ? "bg-taupe/10 text-taupe"
                                : "bg-border text-taupe/60")
                          }>
                            {s.impact}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <Link
                            to={s.link as any}
                            className="inline-flex items-center border border-border bg-card text-xs font-medium text-foreground px-3 py-1.5 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
                          >
                            Fix
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

const PLATFORMS: { id: "instagram" | "facebook" | "tiktok"; label: string; note: string }[] = [
  { id: "instagram", label: "Instagram", note: "Feed, Reels & Stories" },
  { id: "facebook",  label: "Facebook",  note: "Page posts & Stories" },
  { id: "tiktok",    label: "TikTok",    note: "Coming soon" },
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

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  const handleConnect = async (platform: "instagram" | "facebook") => {
    setBusy(platform);
    try {
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

  const connectedCount = accounts.filter((a) => a.status === "connected").length;

  return (
    <section className="mb-10 border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Connected accounts
        </h2>
        {!loading && connectedCount > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-sage">
            {connectedCount} connected
          </span>
        )}
      </div>
      <p className="text-sm text-taupe px-5 py-4 border-b border-border">
        Connect your social accounts to publish content directly from the calendar.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm" style={{ minWidth: "480px" }}>
          <thead className="bg-muted border-b border-border text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            <tr>
              <th className="px-5 py-3">Platform</th>
              <th className="px-5 py-3">Account</th>
              <th className="px-5 py-3 w-[160px] text-right">Status · Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {PLATFORMS.map((p) => {
              const account     = accounts.find((a) => a.platform === p.id && a.status === "connected");
              const isBusy      = busy === p.id || busy === account?.id;
              const isComingSoon = p.id === "tiktok";

              return (
                <tr key={p.id} className="hover:bg-nude/20 transition-colors">
                  <td className="px-5 py-4">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="text-[10px] text-taupe mt-0.5">{p.note}</p>
                  </td>
                  <td className="px-5 py-4">
                    {account ? (
                      <div className="flex items-center gap-2">
                        <span className="size-1.5 rounded-full bg-sage shrink-0" />
                        <span className="text-sm truncate max-w-[24ch]">{account.accountName}</span>
                      </div>
                    ) : (
                      <span className="text-sm text-taupe italic">
                        {isComingSoon ? "Not available yet" : "Not connected"}
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {account ? (
                        <>
                          <span className="text-[9px] uppercase tracking-widest text-sage px-2 py-0.5 bg-sage/10">
                            Connected
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDisconnect(account.id, p.label)}
                            disabled={isBusy}
                            className="inline-flex items-center border border-destructive/30 bg-destructive/5 text-destructive text-xs font-medium px-3 py-1.5 hover:bg-destructive/10 active:scale-[0.97] transition-all disabled:opacity-40"
                          >
                            {isBusy ? "…" : "Disconnect"}
                          </button>
                        </>
                      ) : isComingSoon ? (
                        <span className="text-[10px] uppercase tracking-widest text-taupe/40 border border-border px-3 py-1.5">
                          Soon
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleConnect(p.id)}
                          disabled={isBusy || loading}
                          className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3.5 py-1.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-40"
                        >
                          {isBusy ? "Connecting…" : "Connect"}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function NotificationSettings() {
  const [phone,  setPhone]  = useState("");
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api.get("/tenant/profile")
      .then((res) => {
        const data = res.data?.data ?? res.data;
        setPhone(data?.phone ?? "");
      })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch("/tenant/profile", { phone });
      toast.success("Phone number saved.");
    } catch {
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  if (!loaded) return null;

  return (
    <section className="mb-10 border border-border bg-card shadow-sm overflow-hidden">
      <div className="bg-muted px-5 py-3 border-b border-border">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Notification settings
        </h2>
      </div>
      <div className="p-6">
        <p className="text-sm text-taupe mb-5 leading-relaxed max-w-[56ch]">
          Add your phone number to receive SMS alerts when content is ready or generation fails.
        </p>
        <div className="border border-border bg-card shadow-sm overflow-hidden max-w-md">
          <div className="bg-muted px-4 py-2 border-b border-border">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Phone number (with country code)
            </p>
          </div>
          <div className="flex items-stretch divide-x divide-border">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91xxxxxxxxxx"
              className="flex-1 bg-transparent px-4 py-3 text-sm focus:outline-none placeholder:text-taupe/50"
            />
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-4 py-3 hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40 shrink-0"
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatCell({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 px-5 py-4 group hover:bg-nude/20 transition-colors cursor-default">
      <p className="text-[10px] uppercase tracking-widest text-taupe mb-1.5 group-hover:text-taupe transition-colors">
        {label}
      </p>
      <p className="font-serif text-2xl tabular-nums">{value}</p>
    </div>
  );
}
