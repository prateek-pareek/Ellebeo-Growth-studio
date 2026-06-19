import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { useProfile } from "@/lib/providers/profile-provider";
import { useAuth } from "@/lib/providers/auth-provider";
import {
  Camera, LogOut, Instagram, Facebook,
  Star, MessageSquare, Clock, BarChart2,
  Image, Layers, ChevronRight,
  TrendingUp, Zap, CheckCircle2,
  Link2, RefreshCw, Shield, Sparkles,
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
  hidden: { opacity: 0, y: 20 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] } },
};
const stagger = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };

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

  const completionColor =
    profile.completion >= 80 ? "from-sage via-sage to-sage/70"
    : profile.completion >= 50 ? "from-taupe via-taupe to-taupe/70"
    : "from-taupe/60 to-taupe/40";

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5 pb-12">

      {/* ── Hero ─────────────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="relative overflow-hidden rounded-3xl bg-card border border-nude/60 shadow-sm">

        {/* layered ambient */}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-nude/40 via-offwhite/20 to-sage/10" />
        <div className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-nude/50 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-16 -left-16 size-56 rounded-full bg-sage/20 blur-3xl" />

        {/* top action bar */}
        <div className="relative flex items-center justify-between px-7 pt-6 pb-0">
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">
            <Sparkles className="size-3" /> Elle.Be.O Growth
          </span>
          <button
            onClick={handleLogout}
            className="inline-flex items-center gap-1.5 border border-border/70 bg-card/70 backdrop-blur-sm text-[10px] font-medium text-taupe px-3.5 py-1.5 rounded-full hover:bg-nude/40 hover:text-foreground active:scale-[0.97] transition-all"
          >
            <LogOut className="size-3" />
            Sign out
          </button>
        </div>

        {/* main hero body */}
        <div className="relative px-7 pt-6 pb-7">
          <div className="flex flex-col sm:flex-row sm:items-end gap-6">

            {/* Avatar block */}
            <div className="relative shrink-0 w-fit group">
              {/* animated ring */}
              <div className="absolute -inset-1 rounded-full bg-gradient-to-tr from-taupe via-nude to-sage/60 opacity-60 blur-sm group-hover:opacity-100 transition-opacity duration-500" />
              <div className="relative p-1 rounded-full bg-gradient-to-tr from-taupe/60 via-nude to-sage/50">
                <InitialsAvatar
                  name={technician.name}
                  imageUrl={avatarUrl || undefined}
                  className="size-24 ring-2 ring-card"
                  textClassName="text-3xl"
                />
              </div>
              {/* camera overlay */}
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="absolute inset-0 rounded-full flex items-center justify-center bg-foreground/0 group-hover:bg-foreground/50 transition-colors duration-200"
              >
                {uploading
                  ? <div className="size-5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  : <Camera className="size-5 text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                }
              </button>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleAvatarUpload} />
              {/* status dot */}
              <span className="absolute bottom-1.5 right-1.5 size-3.5 rounded-full bg-sage border-2 border-card shadow-sm" />
            </div>

            {/* Identity */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1.5">
                <span className="inline-flex items-center gap-1 text-[8px] font-bold uppercase tracking-[0.25em] bg-foreground text-offwhite px-2.5 py-1 rounded-full">
                  <Shield className="size-2.5" /> Pro
                </span>
              </div>
              <h1 className="font-serif text-4xl sm:text-5xl leading-[1.05] tracking-tight">{technician.name}</h1>
              <p className="text-sm text-taupe mt-1.5 flex items-center gap-1.5">
                {technician.handle && <span className="font-medium text-foreground/70">{technician.handle}</span>}
                {technician.handle && technician.city && <span className="text-taupe/40">·</span>}
                {technician.city && <span>{technician.city}</span>}
              </p>
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="mt-2.5 text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors disabled:opacity-40"
              >
                {uploading ? "Uploading…" : "Change photo"}
              </button>
            </div>

            {/* Right — CTA hint */}
            <div className="hidden sm:flex flex-col items-end gap-3">
              <div className="text-right max-w-[26ch]">
                <p className="font-serif text-base leading-snug text-taupe">
                  Small fixes lift bookings by{" "}
                  <span className="text-foreground font-semibold">20%+</span>
                </p>
              </div>
              <Link
                to="/brand"
                className="inline-flex items-center gap-1.5 border border-border bg-card/80 text-[10px] font-medium text-foreground px-4 py-2 rounded-full shadow-sm hover:bg-nude/30 active:scale-[0.97] transition-all"
              >
                Edit brand profile <ChevronRight className="size-3" />
              </Link>
            </div>
          </div>

          {/* Completion bar */}
          <div className="mt-8 pt-6 border-t border-border/40">
            <div className="flex items-end justify-between mb-3">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-0.5">Profile strength</p>
                <p className="text-xs text-taupe">
                  {profile.completion >= 80
                    ? "Great shape — high search visibility"
                    : profile.completion >= 50
                    ? "Getting there — a few fixes needed"
                    : "Needs attention — complete your profile"}
                </p>
              </div>
              <span className="font-serif text-3xl tabular-nums leading-none">{profile.completion}<span className="text-base text-taupe font-sans">%</span></span>
            </div>

            {/* Track with milestones */}
            <div className="relative">
              <div className="h-2 bg-border/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${profile.completion}%` }}
                  transition={{ duration: 1.2, delay: 0.5, ease: [0.22, 1, 0.36, 1] as [number,number,number,number] }}
                  className={`h-full rounded-full bg-gradient-to-r ${completionColor}`}
                />
              </div>
              {/* milestone ticks */}
              {[50, 80, 100].map((m) => (
                <div
                  key={m}
                  className="absolute top-0 -translate-x-px h-2 w-px bg-card"
                  style={{ left: `${m}%` }}
                />
              ))}
            </div>
            <div className="flex justify-between mt-1.5">
              {[{ v: 50, l: "Good" }, { v: 80, l: "Strong" }, { v: 100, l: "Perfect" }].map(({ v, l }) => (
                <span key={v} className="text-[8px] uppercase tracking-widest text-taupe/50" style={{ marginLeft: v === 50 ? "calc(50% - 1rem)" : v === 80 ? "calc(80% - 1.5rem)" : "calc(100% - 2rem)" }}>
                  {l}
                </span>
              ))}
            </div>
          </div>
        </div>
      </motion.div>

      {/* ── Metrics grid ─────────────────────────────────────────────────── */}
      <motion.div variants={fadeUp}>
        <p className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe mb-3 px-0.5">Performance snapshot</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {[
            { icon: Star,          label: "Avg. rating",  value: profile.averageRating.toString(),   accent: "text-amber-500",  bg: "bg-amber-50" },
            { icon: MessageSquare, label: "Reviews",      value: profile.reviewsCount.toString(),    accent: "text-blue-500",   bg: "bg-blue-50"  },
            { icon: Clock,         label: "Avg. reply",   value: `${profile.responseTimeHours}h`,   accent: "text-sage",       bg: "bg-sage/10"  },
            { icon: BarChart2,     label: "Bio strength", value: profile.bioStrength,                accent: "text-taupe",      bg: "bg-nude/30"  },
            { icon: Layers,        label: "Services",     value: `${profile.servicesListed}/${profile.servicesRecommended}`, accent: "text-purple-500", bg: "bg-purple-50" },
            { icon: Image,         label: "Photos",       value: `${profile.photosCount}/${profile.photosRecommended}`,      accent: "text-rose-500",   bg: "bg-rose-50"   },
          ].map(({ icon: Icon, label, value, accent, bg }) => (
            <motion.div
              key={label}
              whileHover={{ y: -2, transition: { duration: 0.2 } }}
              className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm hover:shadow-md hover:border-foreground/15 transition-all cursor-default group"
            >
              <div className={`inline-flex items-center justify-center size-7 rounded-lg ${bg} mb-3`}>
                <Icon className={`size-3.5 ${accent}`} />
              </div>
              <p className="font-serif text-2xl tabular-nums leading-none">{value}</p>
              <p className="text-[9px] uppercase tracking-widest text-taupe mt-1.5 leading-tight">{label}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* ── Connected accounts + Billing ────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <motion.div variants={fadeUp}><ConnectedAccounts /></motion.div>
        <motion.div variants={fadeUp}>
          <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden h-full flex flex-col">
            <div className="px-5 py-4 border-b border-border flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-foreground/5 flex items-center justify-center">
                <Zap className="size-3.5 text-taupe" />
              </div>
              <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">Plan &amp; Billing</h2>
            </div>
            <div className="flex-1 p-5 flex flex-col gap-4">
              <p className="text-xs text-taupe leading-relaxed">
                Upgrade your plan to unlock unlimited AI content generation for your studio.
              </p>
              <div className="rounded-xl border border-border/60 bg-muted/30 px-4 py-3 flex items-center gap-3">
                <Sparkles className="size-4 text-taupe shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium">Growth Studio Plan</p>
                  <p className="text-[10px] text-taupe">Unlock unlimited AI content generation</p>
                </div>
              </div>
              <Link
                to="/plans"
                className="inline-flex items-center justify-center gap-1.5 bg-foreground text-offwhite text-xs font-semibold px-5 py-2.5 rounded-xl hover:opacity-90 active:scale-[0.97] transition-all mt-auto"
              >
                View plans →
              </Link>
            </div>
          </div>
        </motion.div>
      </div>

      {/* ── Recommendations ──────────────────────────────────────────────── */}
      <motion.div variants={fadeUp} className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="size-7 rounded-lg bg-foreground/5 flex items-center justify-center">
              <TrendingUp className="size-3.5 text-taupe" />
            </div>
            <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">Recommended improvements</h2>
          </div>
          {profile.suggestions.length > 0 && (
            <span className="text-[9px] font-bold uppercase tracking-widest text-taupe bg-muted border border-border px-2.5 py-1 rounded-full">
              {profile.suggestions.length} item{profile.suggestions.length !== 1 ? "s" : ""}
            </span>
          )}
        </div>

        {profile.suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center m-6 py-14 text-center rounded-2xl border-2 border-dashed border-border bg-muted/20">
            <CheckCircle2 className="size-8 text-sage mb-3" />
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-1">All good</p>
            <p className="text-sm text-taupe">Your profile is in great shape.</p>
          </div>
        ) : (
          <div className="divide-y divide-border/60">
            {profile.suggestions.map((s, i) => (
              <div key={i} className="flex items-center gap-4 px-6 py-4 hover:bg-nude/20 transition-colors group">
                {/* impact accent bar */}
                <div className={`shrink-0 w-0.5 h-8 rounded-full ${
                  s.impact === "High" ? "bg-foreground" : s.impact === "Medium" ? "bg-taupe/50" : "bg-border"
                }`} />
                <span className="shrink-0 font-serif text-lg tabular-nums text-taupe/30 w-5 text-right">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm leading-snug">{s.label}</p>
                </div>
                <span className={`shrink-0 text-[8px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-full ${
                  s.impact === "High"
                    ? "bg-foreground text-offwhite"
                    : s.impact === "Medium"
                    ? "bg-taupe/10 text-taupe border border-taupe/20"
                    : "bg-border/60 text-taupe/60"
                }`}>
                  {s.impact}
                </span>
                <Link
                  to={s.link as any}
                  className="shrink-0 inline-flex items-center gap-1 border border-border bg-card text-[10px] font-medium text-foreground px-3 py-1.5 rounded-full hover:bg-nude/30 hover:shadow-sm active:scale-[0.97] transition-all opacity-0 group-hover:opacity-100"
                >
                  Fix <ChevronRight className="size-3" />
                </Link>
              </div>
            ))}
          </div>
        )}
      </motion.div>

      {/* ── Quick actions ──────────────────────────────────────────────────── */}
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
        <Link
          to="/plans"
          className="inline-flex items-center gap-2 border border-border bg-card text-xs font-medium text-foreground px-4 py-2.5 rounded-full shadow-sm hover:bg-nude/30 hover:shadow-md active:scale-[0.97] transition-all"
        >
          View plans & billing
        </Link>
      </motion.div>

    </motion.div>
  );
}

// ─── Connected accounts ────────────────────────────────────────────────────────

const PLATFORMS: {
  id: "instagram" | "facebook";
  label: string;
  note: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  iconColor: string;
}[] = [
  {
    id: "instagram", label: "Instagram", note: "Feed, Reels & Stories",
    icon: Instagram,
    gradient: "from-pink-500 via-rose-500 to-orange-400",
    iconColor: "text-white",
  },
  // {
  //   id: "facebook", label: "Facebook", note: "Page posts & Stories",
  //   icon: Facebook,
  //   gradient: "from-blue-600 to-blue-500",
  //   iconColor: "text-white",
  // },
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
    if (!code || !state) return;

    // Clean URL immediately so a refresh doesn't re-trigger
    window.history.replaceState({}, "", window.location.pathname);

    let platform = "instagram";
    try {
      const decoded = JSON.parse(Buffer.from(state, "base64url").toString());
      if (decoded.platform === "facebook") platform = "facebook";
    } catch {}

    api.post(`/social-accounts/connect/${platform}/exchange`, { code, state })
      .then(() => {
        toast.success(`${platform.charAt(0).toUpperCase() + platform.slice(1)} connected!`);
        fetchAccounts();
      })
      .catch(() => toast.error("Connection failed. Try again."));
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

  const connectedCount = accounts.filter((a) => a.status === "connected").length;

  return (
    <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden h-full flex flex-col">
      {/* header */}
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="size-7 rounded-lg bg-foreground/5 flex items-center justify-center">
            <Link2 className="size-3.5 text-taupe" />
          </div>
          <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] text-foreground">Connected accounts</h2>
        </div>
        {!loading && connectedCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/20 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage animate-pulse" />
            {connectedCount} live
          </span>
        )}
      </div>

      <p className="text-xs text-taupe px-5 py-3 border-b border-border/60 bg-muted/30">
        Publish directly from your content calendar when connected.
      </p>

      {/* platform rows */}
      <div className="flex-1 divide-y divide-border/60">
        {PLATFORMS.map((p) => {
          const account = accounts.find((a) => a.platform === p.id && a.status === "connected");
          const isBusy  = busy === p.id || busy === account?.id;
          const Icon    = p.icon;

          return (
            <div key={p.id} className="flex items-center gap-4 px-5 py-4 hover:bg-nude/20 transition-colors group">
              {/* icon */}
              <div className={`shrink-0 size-10 rounded-xl flex items-center justify-center ${
                account
                  ? `bg-gradient-to-br ${p.gradient} shadow-sm`
                  : "bg-muted border border-border"
              }`}>
                <Icon className={`size-4.5 ${account ? p.iconColor : "text-taupe"}`} />
              </div>

              {/* info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-none">{p.label}</p>
                <p className="text-[10px] text-taupe mt-0.5 truncate">
                  {account ? (account.accountHandle ?? account.accountName) : p.note}
                </p>
              </div>

              {/* action */}
              <div className="shrink-0">
                {account ? (
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/20 px-2.5 py-1 rounded-full">
                      <CheckCircle2 className="size-2.5" /> Connected
                    </span>
                    <button
                      type="button"
                      onClick={() => handleDisconnect(account.id, p.label)}
                      disabled={isBusy}
                      className="text-[10px] text-destructive/60 hover:text-destructive transition-colors disabled:opacity-40"
                    >
                      {isBusy ? <RefreshCw className="size-3 animate-spin" /> : "Remove"}
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleConnect(p.id)}
                    disabled={isBusy || loading}
                    className={`inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest px-4 py-2 rounded-full shadow-sm transition-all disabled:opacity-40 active:scale-[0.97] bg-gradient-to-r ${p.gradient} text-white hover:shadow-md hover:opacity-90`}
                  >
                    {isBusy
                      ? <><RefreshCw className="size-3 animate-spin" /> Connecting…</>
                      : <><Zap className="size-3" /> Connect</>
                    }
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* footer hint */}
      <div className="px-5 py-3 border-t border-border/60 bg-muted/20">
        <p className="text-[9px] text-taupe/60 flex items-center gap-1">
          <Shield className="size-2.5" />
          Tokens are encrypted and stored securely. We never post without your approval.
        </p>
      </div>
    </div>
  );
}

