import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { useProfile } from "@/lib/providers/profile-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import {
  Camera, LogOut, Instagram, Facebook, Zap,
  Star, MessageSquare, Clock, BarChart2,
  Image, Layers, Bell, ChevronRight,
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

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

// ─── Page ─────────────────────────────────────────────────────────────────────

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
    <motion.div
      variants={stagger}
      initial="hidden"
      animate="show"
      className="space-y-6 pb-10"
    >

      {/* ── Hero header card ──────────────────────────────────────────────── */}
      <motion.div
        variants={fadeUp}
        className="relative overflow-hidden rounded-2xl border border-nude/60 bg-card shadow-sm"
      >
        {/* Ambient gradient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nude/30 via-transparent to-sage/10" aria-hidden />
        <div className="pointer-events-none absolute -top-20 -right-20 size-64 rounded-full bg-nude/30 blur-3xl" aria-hidden />

        <div className="relative px-6 py-8 sm:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center gap-6 sm:gap-8">

            {/* Avatar */}
            <div className="relative shrink-0 group w-fit">
              <div className="p-0.5 rounded-full bg-gradient-to-tr from-taupe/40 via-nude to-sage/40">
                <InitialsAvatar
                  name={technician.name}
                  imageUrl={avatarUrl || undefined}
                  className="size-20 ring-2 ring-card"
                  textClassName="text-2xl"
                />
              </div>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/40 transition-colors"
              >
                <Camera className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
              {/* Online dot */}
              <span className="absolute bottom-1 right-1 size-3.5 rounded-full bg-sage border-2 border-card" />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.3em] text-taupe mb-1">Profile optimisation</p>
              <h1 className="font-serif text-3xl sm:text-4xl leading-tight tracking-tight">{technician.name}</h1>
              <p className="text-sm text-taupe mt-1">{technician.handle} · {technician.city}</p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="mt-2 text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
            </div>

            {/* Right side */}
            <div className="flex flex-col items-start sm:items-end gap-4 shrink-0">
              <div className="text-right hidden sm:block">
                <p className="font-serif text-lg leading-snug text-taupe max-w-[28ch] text-left sm:text-right">
                  Small fixes to your listing lift bookings by{" "}
                  <span className="text-foreground font-semibold">20%+</span>.
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="inline-flex items-center gap-2 border border-border bg-card/80 backdrop-blur-sm text-xs font-medium text-foreground px-4 py-2.5 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
              >
                <LogOut className="size-3" />
                Sign out
              </button>
            </div>
          </div>

          {/* Completion bar */}
          <div className="mt-7 pt-6 border-t border-border/50">
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-taupe">Profile strength</span>
              <span className="font-serif text-xl tabular-nums">{profile.completion}%</span>
            </div>
            <div className="h-1.5 bg-border/60 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${profile.completion}%` }}
                transition={{ duration: 1, delay: 0.4, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }}
                className="h-full rounded-full bg-gradient-to-r from-taupe via-sage to-sage"
              />
            </div>
            <p className="mt-2 text-xs text-taupe">
              Profiles above 90% appear higher in search and convert twice as often.
            </p>
          </div>
        </div>
      </motion.div>

      {/* ── Key metrics ───────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { icon: Star,         label: "Avg. rating",      value: profile.averageRating.toString() },
          { icon: MessageSquare,label: "Reviews",           value: profile.reviewsCount.toString() },
          { icon: Clock,        label: "Avg. reply",        value: `${profile.responseTimeHours}h` },
          { icon: BarChart2,    label: "Bio strength",      value: profile.bioStrength },
          { icon: Layers,       label: "Services",          value: `${profile.servicesListed}/${profile.servicesRecommended}` },
          { icon: Image,        label: "Photos",            value: `${profile.photosCount}/${profile.photosRecommended}` },
        ].map(({ icon: Icon, label, value }) => (
          <div key={label} className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm hover:border-foreground/20 hover:shadow-md transition-all group cursor-default">
            <Icon className="size-3.5 text-taupe mb-3 group-hover:text-foreground transition-colors" />
            <p className="font-serif text-2xl tabular-nums leading-none">{value}</p>
            <p className="text-[9px] uppercase tracking-widest text-taupe mt-1.5">{label}</p>
          </div>
        ))}
      </motion.div>

      {/* ── Notification settings + Connected accounts (2-col on lg) ─────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <motion.div variants={fadeUp}>
          <NotificationSettings />
        </motion.div>
        <motion.div variants={fadeUp}>
          <ConnectedAccounts />
        </motion.div>
      </div>

      {/* ── Recommendations ───────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="bg-muted border-b border-border px-5 py-3 flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
            Recommended improvements
          </h2>
          {profile.suggestions.length > 0 && (
            <span className="text-[10px] uppercase tracking-widest text-taupe">
              {profile.suggestions.length} items
            </span>
          )}
        </div>

        {profile.suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-12 text-center rounded-xl bg-muted/20">
            <span className="text-2xl mb-3">✦</span>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">All good</p>
            <p className="text-sm text-taupe">Your profile is in great shape — no improvements needed.</p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {profile.suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-5 py-4 hover:bg-nude/20 transition-colors group">
                <span className="shrink-0 font-serif text-lg tabular-nums text-taupe/30 w-6 text-center">
                  {i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{s.label}</p>
                </div>
                <span className={
                  "shrink-0 text-[9px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full " +
                  (s.impact === "High"
                    ? "bg-foreground text-offwhite"
                    : s.impact === "Medium"
                      ? "bg-taupe/10 text-taupe border border-taupe/20"
                      : "bg-border text-taupe/60")
                }>
                  {s.impact}
                </span>
                <Link
                  to={s.link as any}
                  className="shrink-0 inline-flex items-center gap-1 border border-border bg-card text-xs font-medium text-foreground px-3 py-1.5 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
                >
                  Fix <ChevronRight className="size-3" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Quick actions ─────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="flex flex-wrap gap-3">
        <Link
          to="/brand"
          className="inline-flex items-center gap-2 border border-border bg-card text-xs font-medium text-foreground px-4 py-2.5 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
        >
          Edit brand profile
        </Link>
        <Link
          to="/appointments"
          className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-medium px-4 py-2.5 rounded-full shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
        >
          Add photos from appointments
        </Link>
      </motion.div>

    </motion.div>
  );
}

// ─── Connected accounts ────────────────────────────────────────────────────────

const PLATFORMS: { id: "instagram" | "facebook" | "tiktok"; label: string; note: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "instagram", label: "Instagram", note: "Feed, Reels & Stories", icon: Instagram },
  { id: "facebook",  label: "Facebook",  note: "Page posts & Stories",  icon: Facebook  },
  { id: "tiktok",    label: "TikTok",    note: "Coming soon",           icon: Zap       },
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

  const handleConnect = async (platform: string) => {
    setBusy(platform);
    try {
      await api.get(`/social-accounts/connect/${platform}/callback`, { params: { code: "mock_connect" } });
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
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden h-full">
      <div className="bg-muted border-b border-border px-5 py-3 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Connected accounts
        </h2>
        {!loading && accounts.filter(a => a.status === "connected").length > 0 && (
          <span className="text-[10px] uppercase tracking-widest text-sage">
            {accounts.filter(a => a.status === "connected").length} connected
          </span>
        )}
      </div>
      <p className="text-xs text-taupe px-5 py-3 border-b border-border">
        Connect socials to publish directly from your calendar.
      </p>
      <div className="divide-y divide-border">
        {PLATFORMS.map((p) => {
          const account      = accounts.find((a) => a.platform === p.id && a.status === "connected");
          const isBusy       = busy === p.id || busy === account?.id;
          const isComingSoon = p.id === "tiktok";
          const Icon         = p.icon;

          return (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-nude/20 transition-colors">
              <div className="size-9 rounded-xl border border-border bg-muted flex items-center justify-center shrink-0">
                <Icon className="size-4 text-taupe" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{p.label}</p>
                <p className="text-[10px] text-taupe mt-0.5">
                  {account ? account.accountName : p.note}
                </p>
              </div>
              <div className="shrink-0">
                {account ? (
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/20 px-2.5 py-1 rounded-full">
                      <span className="size-1.5 rounded-full bg-sage" />
                      Live
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id, p.label)}
                      disabled={isBusy}
                      className="text-[10px] text-destructive/70 hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      {isBusy ? "…" : "Disconnect"}
                    </button>
                  </div>
                ) : isComingSoon ? (
                  <span className="text-[9px] uppercase tracking-widest text-taupe/40 border border-border px-2.5 py-1 rounded-full">
                    Soon
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(p.id)}
                    disabled={isBusy || loading}
                    className="inline-flex items-center gap-1 bg-foreground text-offwhite text-[10px] font-semibold uppercase tracking-widest px-3.5 py-1.5 rounded-full shadow-sm hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40"
                  >
                    {isBusy ? "…" : "Connect"}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Notification settings ─────────────────────────────────────────────────────

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
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden h-full">
      <div className="bg-muted border-b border-border px-5 py-3 flex items-center gap-2">
        <Bell className="size-3 text-taupe" />
        <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          Notification settings
        </h2>
      </div>
      <div className="p-5">
        <p className="text-xs text-taupe leading-relaxed mb-5">
          Add your phone number to receive SMS alerts when content is ready or generation fails.
        </p>
        <label className="block text-[9px] font-bold uppercase tracking-widest text-taupe mb-2">
          Phone number (with country code)
        </label>
        <div className="flex items-stretch gap-2">
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="+91 00000 00000"
            className="flex-1 border border-border bg-muted/40 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-foreground/30 placeholder:text-taupe/40 transition-colors"
          />
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center bg-foreground text-offwhite text-xs font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-40 shrink-0"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
