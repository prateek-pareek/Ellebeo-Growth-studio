import { createRootRoute, HeadContent, Link, Scripts } from "@tanstack/react-router";
import { AppShell } from "@/components/AppShell";
import { AuthProvider } from "@/lib/providers/auth-provider";

import appCss from "../styles.css?url";

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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Elle.Be.O Growth — AI marketing studio for beauty professionals" },
      {
        name: "description",
        content:
          "Elle.Be.O Growth is the AI-powered brand, content and growth operating system for independent beauty professionals.",
      },
      { name: "author", content: "Elle.Be.O" },
      { property: "og:title", content: "Elle.Be.O Growth — AI marketing studio for beauty professionals" },
      { property: "og:description", content: "AI-powered brand, content, and growth operating system for independent beauty professionals." },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "Elle.Be.O Growth — AI marketing studio for beauty professionals" },
      { name: "description", content: "AI-powered brand, content, and growth operating system for independent beauty professionals." },
      { name: "twitter:description", content: "AI-powered brand, content, and growth operating system for independent beauty professionals." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c9b81c0b-70b6-40eb-a425-e85c8f95ba20/id-preview-e259031d--dd742692-4cc2-4b22-8739-ac66e559f769.lovable.app-1777391219187.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/c9b81c0b-70b6-40eb-a425-e85c8f95ba20/id-preview-e259031d--dd742692-4cc2-4b22-8739-ac66e559f769.lovable.app-1777391219187.png" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  shellComponent: RootShell,
  component: () => (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  ),
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}
