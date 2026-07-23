import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/providers/auth-provider";
import { InitialsAvatar } from "@/components/InitialsAvatar";
import { NotificationBell } from "@/components/NotificationPanel";
import { api } from "@/lib/api";
import {
  Home,
  Sparkles,
  CalendarRange,
  Layers,
  UserCircle2,
  BookOpen,
} from "lucide-react";

const NAV: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/appointments", label: "Appointments", icon: Layers },
  { to: "/bookings", label: "Bookings", icon: BookOpen },
  { to: "/content", label: "Content", icon: Sparkles },
  { to: "/profile", label: "Profile", icon: UserCircle2 },
];

const DESKTOP_NAV: Array<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/brand", label: "Brand" },
  { to: "/appointments", label: "Appointments" },
  { to: "/bookings", label: "Bookings" },
  { to: "/content", label: "Content" },
  { to: "/calendar", label: "Calendar" },
  { to: "/templates", label: "Templates" },
  // { to: "/campaigns", label: "Campaigns" },
  { to: "/profile", label: "Profile" },
];

const AUTH_ROUTES = ['/login', '/signup', '/auth', '/landing'];

// Only the app's own custom scheme may be used as a post-OAuth redirect target —
// `state` round-trips through the URL unauthenticated, so an attacker can set
// mobileRedirectUri to a `javascript:` URI to run script in this origin unless
// we reject anything that isn't our deep link scheme before it reaches href/location.
function isSafeMobileRedirectUri(uri: string): boolean {
  return /^elleobe:\/\//i.test(uri);
}

/** Safe base64url decode — works with or without the Node Buffer polyfill. */
function decodeOAuthState(state: string): Record<string, string> | null {
  try {
    if (typeof Buffer !== "undefined") {
      return JSON.parse(Buffer.from(state, "base64url").toString());
    }
  } catch {}
  try {
    const base64 = state.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(base64));
  } catch {}
  return null;
}

export function AppShell() {
  const { pathname } = useLocation();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const oauthHandled = useRef(false);
  // Computed synchronously so the processing screen is up from the very first
  // render — this (not `oauthParams`, which is memoized once and never goes
  // falsy again) is what gates the screen, so clearing it below actually lets
  // the app render again instead of staying stuck forever.
  const [oauthProcessing, setOauthProcessing] = useState(
    () => pathname === "/profile" && new URLSearchParams(window.location.search).has("state"),
  );
  const [oauthStatus, setOauthStatus] = useState<"processing" | "success" | "error">("processing");
  const [oauthMessage, setOauthMessage] = useState("Connecting your account…");
  const [mobileUrl, setMobileUrl] = useState("");

  // ── Detect OAuth callback SYNCHRONOUSLY (useMemo runs during render, before useEffect) ──
  const oauthParams = useMemo(() => {
    if (pathname !== "/profile") return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    if (!state) return null;
    const error = params.get("error") || params.get("error_code");
    return { code, state, error };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Process OAuth callback (async API call) ──
  useEffect(() => {
    if (!oauthParams || oauthHandled.current) return;
    oauthHandled.current = true;
    setOauthProcessing(true);

    // Clean URL so a refresh doesn't re-trigger
    window.history.replaceState({}, "", "/profile");

    const { code, state, error } = oauthParams;
    const decoded = decodeOAuthState(state);
    const platform = decoded?.platform === "facebook" ? "facebook" : "instagram";
    const rawMobileRedirectUri = decoded?.mobileRedirectUri || "";
    const mobileRedirectUri = isSafeMobileRedirectUri(rawMobileRedirectUri) ? rawMobileRedirectUri : "";
    const isMobile = !!mobileRedirectUri;

    // Handle denied / error
    if (error || !code) {
      if (isMobile) {
        const target = `${mobileRedirectUri}?error=${platform}_denied`;
        setMobileUrl(target);
        setOauthStatus("success");
        setOauthMessage("Redirecting back to the app…");
        window.location.href = target;
      } else {
        setOauthStatus("error");
        setOauthMessage("Permission was denied. Please try again.");
        setTimeout(() => setOauthProcessing(false), 3000);
      }
      return;
    }

    // Exchange code for tokens
    api
      .post(`/social-accounts/connect/${platform}/exchange`, { code, state })
      .then(() => {
        if (isMobile) {
          const target = `${mobileRedirectUri}?connected=${platform}`;
          setMobileUrl(target);
          setOauthStatus("success");
          setOauthMessage("Connected! Returning to the app…");
          window.location.href = target;
        } else {
          setOauthStatus("success");
          setOauthMessage("Connected! Redirecting…");
          setTimeout(() => {
            setOauthProcessing(false);
          }, 1500);
        }
      })
      .catch(() => {
        if (isMobile) {
          const target = `${mobileRedirectUri}?error=${platform}_connect_failed`;
          setMobileUrl(target);
          setOauthStatus("error");
          setOauthMessage("Connection failed. Redirecting back…");
          window.location.href = target;
        } else {
          setOauthStatus("error");
          setOauthMessage("Connection failed. Please try again.");
          setTimeout(() => setOauthProcessing(false), 3000);
        }
      });
  }, [oauthParams]);

  // ── Show OAuth processing UI (bypasses auth loading + auth guard) ──
  if (oauthProcessing) {
    return (
      <div className="min-h-dvh bg-background flex flex-col items-center justify-center gap-4 px-4 text-center">
        {oauthStatus === "processing" && (
          <div className="size-6 border-2 border-taupe/30 border-t-foreground rounded-full animate-spin" />
        )}
        {oauthStatus === "success" && (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 dark:bg-emerald-950">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-emerald-600 dark:text-emerald-400">
              <path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
        )}
        {oauthStatus === "error" && (
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-red-600 dark:text-red-400">
              <path d="M6 18L18 6M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </div>
        )}
        <p className="text-sm text-muted-foreground max-w-xs">{oauthMessage}</p>
        {mobileUrl && (
          <a
            href={mobileUrl}
            className="inline-block rounded-md bg-zinc-900 px-4 py-2 text-xs font-bold uppercase tracking-widest text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-200">
            Open App
          </a>
        )}
      </div>
    );
  }

  const isPlansCallback = useMemo(() => {
    if (pathname !== "/plans") return false;
    const params = new URLSearchParams(window.location.search);
    return params.has("success") || params.has("canceled");
  }, [pathname]);

  useEffect(() => {
    if (loading) return;
    if (isPlansCallback) return;
    if (!user && !AUTH_ROUTES.includes(pathname)) {
      navigate({ to: "/landing" });
    }
    if (user && AUTH_ROUTES.includes(pathname)) {
      navigate({ to: "/" });
    }
  }, [loading, user, pathname, navigate, isPlansCallback]);

  if (loading) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="size-5 border-2 border-taupe/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  if (isPlansCallback || AUTH_ROUTES.includes(pathname)) {
    return <Outlet />;
  }

  if (!user) {
    return (
      <div className="min-h-dvh bg-background flex items-center justify-center">
        <div className="size-5 border-2 border-taupe/30 border-t-foreground rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <header className="px-6 lg:px-12 pt-8 pb-6">
        <nav className="max-w-7xl mx-auto flex items-center justify-between gap-6">
          <Link to="/" className="flex flex-col leading-none">
            <span className="font-serif italic text-2xl tracking-tight">Elle.Be.O</span>
            <span className="eyebrow mt-1">Growth</span>
          </Link>

          <div className="hidden lg:flex items-center gap-7">
            {DESKTOP_NAV.map((item) => {
              const active = pathname === item.to;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={
                    "text-[11px] uppercase tracking-[0.22em] pb-1 transition-colors " +
                    (active
                      ? "text-foreground border-b border-foreground"
                      : "text-taupe hover:text-foreground")
                  }
                >
                  {item.label}
                </Link>
              );
            })}
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <>
                <NotificationBell />
                <div className="hidden sm:flex flex-col items-end leading-tight gap-0.5">
                  <span className="text-sm font-semibold text-foreground">{user?.tenant?.businessName || user?.email}</span>
                  <span className="text-xs text-taupe">{user?.email}</span>
                </div>
                <Link to="/profile">
                  <InitialsAvatar
                    name={user?.tenant?.businessName || user?.email || "?"}
                    imageUrl={user?.avatarUrl ?? undefined}
                    className="size-10 ring-1 ring-border"
                  />
                </Link>
              </>
            ) : (
              <div className="flex items-center gap-4">
                <Link to="/login" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors">
                  Login
                </Link>
                <Link to="/signup" className="text-[10px] uppercase tracking-widest bg-foreground text-background px-4 py-2 hover:bg-taupe transition-colors">
                  Join
                </Link>
              </div>
            )}
          </div>
        </nav>
        <div className="max-w-7xl mx-auto mt-8 border-b hairline" />
      </header>

      <main className="px-6 lg:px-12 pb-32 lg:pb-16">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav primary destinations */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 bg-offwhite/95 backdrop-blur border-t hairline z-40">
        <div className="grid grid-cols-5">
          {NAV.map((item) => {
            const active = pathname === item.to;
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                className={
                  "py-2.5 flex flex-col items-center gap-1 text-[9px] uppercase tracking-[0.15em] " +
                  (active ? "text-foreground" : "text-taupe")
                }
              >
                <Icon className="size-[18px]" />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <footer className="hidden md:block px-6 lg:px-12 pb-10">
        <div className="max-w-7xl mx-auto pt-8 border-t hairline flex items-center justify-between text-[10px] uppercase tracking-[0.35em] text-taupe">
          <span>Elle.Be.O · Growth</span>
          <span>AI Marketing Studio for Beauty Professionals</span>
        </div>
      </footer>
    </div>
  );
}
