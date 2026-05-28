import { createRootRoute, Link } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/providers/auth-provider";
import { Toaster } from "@/components/ui/sonner";

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

export const Route = createRootRoute({
  component: () => (
    <AuthProvider>
      <AppShell />
      <Toaster />
    </AuthProvider>
  ),
  notFoundComponent: NotFoundComponent,
});
