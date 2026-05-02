import { Link, Outlet, useLocation } from "@tanstack/react-router";
import { useAuth } from "@/lib/providers/auth-provider";
import {
  Home,
  Sparkles,
  CalendarRange,
  Layers,
  UserCircle2,
} from "lucide-react";

const NAV: Array<{ to: string; label: string; icon: React.ComponentType<{ className?: string }> }> = [
  { to: "/", label: "Home", icon: Home },
  { to: "/appointments", label: "Appointments", icon: Layers },
  { to: "/content", label: "Content", icon: Sparkles },
  { to: "/calendar", label: "Calendar", icon: CalendarRange },
  { to: "/profile", label: "Profile", icon: UserCircle2 },
];

const DESKTOP_NAV: Array<{ to: string; label: string }> = [
  { to: "/", label: "Home" },
  { to: "/brand", label: "Brand" },
  { to: "/appointments", label: "Appointments" },
  { to: "/content", label: "Content" },
  { to: "/calendar", label: "Calendar" },
  { to: "/templates", label: "Templates" },
  { to: "/campaigns", label: "Campaigns" },
  { to: "/profile", label: "Profile" },
];

export function AppShell() {
  const { pathname } = useLocation();
  const { user } = useAuth();
  
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
            <div className="hidden sm:flex flex-col items-end leading-tight">
              <span className="text-xs font-medium text-foreground">{user?.tenant?.businessName || user?.email || "Guest"}</span>
              <span className="text-[10px] text-taupe">{user?.email || "Signed out"}</span>
            </div>
            <Link to="/profile" className="size-10 rounded-full bg-nude overflow-hidden ring-1 ring-border flex items-center justify-center">
              {user ? (
                <span className="text-sm font-serif italic">{user.email[0].toUpperCase()}</span>
              ) : (
                <UserCircle2 className="size-6 text-taupe" />
              )}
            </Link>
          </div>
        </nav>
        <div className="max-w-7xl mx-auto mt-8 border-b hairline" />
      </header>

      <main className="px-6 lg:px-12 pb-32 lg:pb-16">
        <div className="max-w-7xl mx-auto">
          <Outlet />
        </div>
      </main>

      {/* Mobile bottom nav — 5 primary destinations */}
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
          <span>AI marketing studio for beauty professionals</span>
        </div>
      </footer>
    </div>
  );
}
