import { createRootRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuthProvider, useAuth } from "@/lib/providers/auth-provider";
import { NotificationsProvider } from "@/lib/providers/notifications-provider";
import { Toaster } from "@/components/ui/sonner";
import { TermsModal } from "@/components/TermsModal";
import { useState } from "react";

function NotFoundComponent() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <p className="eyebrow mb-4">Error · 404</p>
        <h1 className="font-serif text-5xl mb-4">Page not found</h1>
        <p className="text-sm text-taupe mb-8">The page you're looking for doesn't exist.</p>
        <Link
          to="/"
          className="inline-flex items-center text-[11px] uppercase tracking-[0.22em] border-b border-foreground pb-1 hover:text-taupe"
        >
          Back to home
        </Link>
      </div>
    </div>
  );
}

function TermsGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const [accepted, setAccepted] = useState(false);

  const needsTerms =
    !loading &&
    user !== null &&
    !accepted &&
    !user.tenant?.termsAcceptedAt;

  return (
    <>
      {children}
      {needsTerms && (
        <TermsModal onAccepted={() => setAccepted(true)} />
      )}
    </>
  );
}

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <NotificationsProvider>
        <TermsGate>
          <AppShell />
        </TermsGate>
        <Toaster />
      </NotificationsProvider>
    </AuthProvider>
  ),
  notFoundComponent: NotFoundComponent,
});
