import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useConsentRequest } from "@/lib/providers/consent-request-provider";

export const Route = createFileRoute("/consent/$id")({
  head: () => ({
    meta: [
      { title: "Client consent — Elle.Be.O Growth" },
      { name: "description", content: "Send a clear consent request to your client before using their content." },
      { property: "og:title", content: "Client consent — Elle.Be.O Growth" },
    ],
  }),
  errorComponent: ({ error }) => (
    <div className="py-20 text-center">
      <p className="text-sm text-destructive">{error.message}</p>
      <Link to="/appointments" className="mt-6 inline-block text-[11px] uppercase tracking-widest border-b border-foreground pb-0.5">
        Back to appointments
      </Link>
    </div>
  ),
  notFoundComponent: () => (
    <div className="py-20 text-center">
      <p className="font-serif text-3xl mb-4">Consent record not found</p>
      <Link to="/appointments" className="text-[11px] uppercase tracking-widest border-b border-foreground pb-0.5">
        Back to appointments
      </Link>
    </div>
  ),
  component: ConsentPage,
});

const PERMISSIONS = [
  {
    id: "use_images",
    title: "Use my photos in social posts",
    help: "Before-and-after images may appear on Instagram, TikTok and Elle.Be.O.",
    default: true,
  },
  {
    id: "show_face",
    title: "Show my face",
    help: "If unchecked, posts will crop or blur the face.",
    default: true,
  },
  {
    id: "use_first_name",
    title: "Use my first name in captions",
    help: "Example: \"Camille came in for...\".",
    default: true,
  },
  {
    id: "tag_account",
    title: "Tag my Instagram account",
    help: "Tags will appear on the post and in stories.",
    default: false,
  },
  {
    id: "anon_only",
    title: "Use anonymously only",
    help: "No name, no tag, face cropped.",
    default: false,
  },
  {
    id: "elle_be_o_feature",
    title: "Allow Elle.Be.O to feature this content",
    help: "Elle.Be.O may share the post on its own channels and homepage.",
    default: false,
  },
];

function ConsentPage() {
  const { id } = Route.useParams();
  const { data, source, error, notFound, loading } = useConsentRequest(id);
  const [perms, setPerms] = useState<Record<string, boolean>>(
    Object.fromEntries(PERMISSIONS.map((p) => [p.id, p.default]))
  );
  const [sent, setSent] = useState(false);

  if (loading && !data) {
    return <div className="py-20 text-center text-xs uppercase tracking-widest text-taupe">Loading…</div>;
  }

  if (notFound || !data) {
    return (
      <div className="py-20 text-center">
        <p className="font-serif text-3xl mb-4">Consent record not found</p>
        <Link to="/appointments" className="text-[11px] uppercase tracking-widest border-b border-foreground pb-0.5">
          Back to appointments
        </Link>
      </div>
    );
  }

  const appointment = data.appointment;

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <p className="eyebrow">Consent request</p>
          {source === "cloud" && !error && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-sage">Live</span>
          )}
          {error && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">Showing sample preview</span>
          )}
          <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">Prototype · no message will be sent</span>
          <span className="text-[9px] uppercase tracking-widest text-taupe">Status: {data.status.replace("_", " ")}</span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Ask <span className="italic">{appointment.clientName}</span> what's okay.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          We send a clean, branded message with the exact permissions below. The client can approve, decline or change individual options. In this prototype, sending is simulated — no SMS or email is delivered.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-12">
        {/* Permissions editor */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-4">What you're asking the client to approve</h2>
          <div className="space-y-px bg-border">
            {PERMISSIONS.map((p) => {
              const on = perms[p.id];
              return (
                <label
                  key={p.id}
                  className="bg-card p-5 flex items-start gap-4 cursor-pointer hover:bg-nude/20 transition-colors"
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={(e) => setPerms({ ...perms, [p.id]: e.target.checked })}
                    className="mt-1 size-4 accent-foreground"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-taupe mt-1">{p.help}</p>
                  </div>
                </label>
              );
            })}
          </div>

          <div className="mt-6">
            <p className="eyebrow mb-3">Personal note (optional)</p>
            <textarea
              rows={3}
              defaultValue={`Hi ${appointment.clientName.split(" ")[0]} — loved working on your ${appointment.service.toLowerCase()} today. Would you be okay if I shared a few photos? I've checked exactly what I'd use below.`}
              className="w-full bg-transparent border-b hairline text-sm py-2 outline-none focus:border-foreground transition-colors resize-none"
            />
          </div>
        </section>

        {/* Preview of what client receives */}
        <aside className="col-span-12 lg:col-span-5">
          <p className="eyebrow mb-4">Preview · what {appointment.clientName.split(" ")[0]} will see</p>
          <div className="artifact p-6">
            <p className="font-serif text-lg mb-1">A quick request from Von</p>
            <p className="text-xs text-taupe mb-4">{appointment.service} · {appointment.date}</p>
            <div className="aspect-[4/5] bg-nude/30 ring-1 ring-border mb-4 overflow-hidden">
              {appointment.afterImage && <img src={appointment.afterImage} alt="" className="w-full h-full object-cover" />}
            </div>
            <p className="text-sm leading-relaxed mb-4">
              I'd love to share a couple of photos from our session. Here's exactly what I'd use:
            </p>
            <ul className="space-y-1.5 text-sm">
              {PERMISSIONS.filter((p) => perms[p.id]).map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <span className="text-sage mt-2 size-1 rounded-full bg-sage shrink-0" />
                  <span>{p.title}</span>
                </li>
              ))}
              {PERMISSIONS.filter((p) => perms[p.id]).length === 0 && (
                <li className="text-xs italic text-taupe">No permissions selected.</li>
              )}
            </ul>
            <div className="mt-5 pt-4 border-t hairline flex gap-2">
              <span className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-2">Approve</span>
              <span className="text-[10px] uppercase tracking-widest border hairline px-3 py-2">Decline</span>
              <span className="text-[10px] uppercase tracking-widest text-taupe py-2">Change options</span>
            </div>
          </div>
        </aside>
      </div>

      {/* Send */}
      <div className="mt-10 border-t hairline pt-6 flex flex-wrap items-center justify-between gap-4">
        <Link to="/appointments" className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
          ← Back to appointments
        </Link>
        {sent ? (
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-widest text-sage">
            <span className="size-1.5 rounded-full bg-sage" />
            Preview sent · in production, {appointment.clientName.split(" ")[0]} would receive a branded message and you'd be notified on reply
          </div>
        ) : (
          <button
            onClick={() => setSent(true)}
            className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
            title="Prototype — no message is delivered"
          >
            Preview send
          </button>
        )}
      </div>
    </div>
  );
}
