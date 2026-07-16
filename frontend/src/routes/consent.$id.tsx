import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useConsentRequest, type ConsentPermissions } from "@/lib/providers/consent-request-provider";
import { useBrandDna } from "@/lib/providers/brand-dna-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";

// This permission can never be honored for medical-aesthetics accounts — AHPRA
// compliance means client faces are never posted, regardless of what's granted.
// The pipeline doesn't blur the client's photo in that case, it never uses the
// client's photo at all (see backend medical-compliance.ts / generation-orchestrator.ts).
const MEDICAL_LOCKED_KEY: keyof ConsentPermissions = "allowShowFace";
const MEDICAL_LOCKED_HELP = "Unavailable for medical aesthetics accounts — client photos are never used in generated content, so this can't be granted.";

export const Route = createFileRoute("/consent/$id")({
  head: () => ({
    meta: [
      { title: "Client consent — Elle.Be.O Growth" },
      { name: "description", content: "Send a clear consent request to your client before using their content." },
      { property: "og:title", content: "Client consent — Elle.Be.O Growth" },
    ],
  }),
  component: ConsentPage,
});

const PERMISSION_ITEMS: { key: keyof ConsentPermissions; title: string; help: string }[] = [
  { key: "allowMarketingContent", title: "Use photos in social posts", help: "Before-and-after images may appear on Instagram, TikTok and Elle.Be.O." },
  { key: "allowShowFace", title: "Show face in content", help: "If declined, posts will crop or blur the face." },
  { key: "allowUseName", title: "Use first name in captions", help: "Example: \"Sarah came in for her facial today.\"" },
  { key: "allowTagSocial", title: "Tag Instagram / TikTok account", help: "Tags appear on the post and in stories." },
  { key: "allowPlatformPromotion", title: "Allow platform promotion", help: "Elle.Be.O may feature this content on its own channels." },
  { key: "allowInternalUse", title: "Internal use (training & improvement)", help: "Used internally to improve AI output quality — never shared publicly." },
];

function PermissionBadge({ granted }: { granted: boolean }) {
  return granted ? (
    <span className="flex items-center justify-center size-5 rounded-full bg-sage/15 text-sage shrink-0 mt-0.5">
      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
        <path d="M1 4l3 3 5-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  ) : (
    <span className="flex items-center justify-center size-5 rounded-full bg-border text-taupe shrink-0 mt-0.5">
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
        <path d="M1.5 1.5l5 5M6.5 1.5l-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    </span>
  );
}

function GrantedView({ data }: { data: NonNullable<ReturnType<typeof useConsentRequest>["data"]> }) {
  const { appointment, permissions: initial } = data;
  const [perms, setPerms] = useState<ConsentPermissions>({ ...initial });
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const { data: brandDnaData } = useBrandDna();
  const isMedical = !!brandDnaData?.isMedicalAestheticsPractitioner;

  const dirty = (Object.keys(perms) as (keyof ConsentPermissions)[]).some(k => perms[k] !== initial[k]);
  const grantedCount = Object.values(perms).filter(Boolean).length;

  const toggle = (key: keyof ConsentPermissions) => {
    if (isMedical && key === MEDICAL_LOCKED_KEY) return;
    setSaved(false);
    setPerms(p => ({ ...p, [key]: !p[key] }));
  };

  const handleSave = async () => {
    if (!appointment.clientId) {
      toast.error("Client ID not found. Please refresh and try again.");
      return;
    }
    setSaving(true);
    try {
      await api.post(`/clients/${appointment.clientId}/consent`, {
        ...perms,
        consentMethod: "manual",
      });
      setSaved(true);
      toast.success("Permissions updated for " + appointment.clientName);
    } catch {
      toast.error("Failed to save. Try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <header className="mt-6 lg:mt-8 mb-8 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-4 flex-wrap">
          <p className="eyebrow">Consent record</p>
          <span className="text-[9px] uppercase tracking-widest border hairline border-sage px-2 py-1 text-sage">Granted</span>
        </div>
        <h1 className="page-title">
          <span className="italic">{appointment.clientName}</span> has consented.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          {grantedCount} of {PERMISSION_ITEMS.length} permissions granted.{" "}
          <span className="text-foreground">Click any permission below to toggle it on or off.</span>
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-10">
        {/* Permission breakdown — now editable */}
        <section className="col-span-12 lg:col-span-7">
          <div className="flex items-center justify-between mb-4">
            <h2 className="eyebrow">Permission breakdown</h2>
            <span className="text-[9px] uppercase tracking-widest text-taupe">Click to toggle</span>
          </div>
          <div className="space-y-px bg-border">
            {PERMISSION_ITEMS.map((item) => {
              const granted = perms[item.key];
              const changed = perms[item.key] !== initial[item.key];
              const locked = isMedical && item.key === MEDICAL_LOCKED_KEY;
              return (
                <label
                  key={item.key}
                  className={"group bg-card p-5 flex items-start gap-4 transition-colors " + (locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-nude/20 " + (!granted ? "opacity-70 hover:opacity-100" : ""))}
                >
                  <input
                    type="checkbox"
                    checked={granted}
                    disabled={locked}
                    onChange={() => toggle(item.key)}
                    className="sr-only"
                  />
                  {/* Toggle circle */}
                  <div className={
                    "flex items-center justify-center size-5 rounded-full border shrink-0 mt-0.5 transition-all " +
                    (granted ? "bg-foreground border-foreground" : "border-border bg-transparent group-hover:border-foreground/40")
                  }>
                    {granted && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className={"text-sm font-medium " + (granted ? "text-foreground" : "text-taupe")}>{item.title}</p>
                      {changed && (
                        <span className="text-[9px] uppercase tracking-widest text-taupe bg-nude/40 border border-nude px-1.5 py-0.5 rounded-full">
                          {granted ? "Added" : "Removed"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-taupe mt-1">{locked ? MEDICAL_LOCKED_HELP : item.help}</p>
                    {locked && granted && (
                      <p className="text-[10px] uppercase tracking-widest text-destructive mt-1">Recorded, but not used in generated content</p>
                    )}
                  </div>
                  <span className={"text-[9px] uppercase tracking-widest shrink-0 " + (granted ? "text-sage" : "text-taupe/50")}>
                    {granted ? "Granted" : "Not granted"}
                  </span>
                </label>
              );
            })}
          </div>

          {/* Save bar — appears when dirty */}
          <div className={
            "mt-4 flex items-center justify-between gap-4 rounded-xl border-2 px-5 py-3.5 transition-all duration-300 " +
            (dirty ? "border-foreground bg-card opacity-100" : "border-border bg-muted opacity-50 pointer-events-none")
          }>
            <p className="text-xs text-taupe">
              {dirty ? "You have unsaved permission changes." : "No changes."}
            </p>
            <div className="flex items-center gap-3">
              {dirty && (
                <button
                  onClick={() => { setPerms({ ...initial }); setSaved(false); }}
                  className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
                >
                  Reset
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="bg-foreground text-offwhite px-5 py-2 text-[10px] uppercase tracking-widest rounded-lg hover:bg-taupe transition-colors disabled:opacity-40"
              >
                {saving ? "Saving…" : saved ? "Saved ✓" : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {/* Side summary + photo */}
        <aside className="col-span-12 lg:col-span-5">
          <p className="eyebrow mb-4">Session details</p>
          <div className="artifact p-6">
            <p className="font-serif text-xl mb-1">{appointment.clientName}</p>
            <p className="text-xs text-taupe mb-4">{appointment.service} · {appointment.date}</p>

            {(appointment.beforePhotoUrl || appointment.afterPhotoUrl) && (
              <div className="flex gap-3 mb-5">
                {appointment.beforePhotoUrl && (
                  <div className="flex-1 aspect-square overflow-hidden bg-nude/20">
                    <img src={appointment.beforePhotoUrl} alt="Before" className="w-full h-full object-cover" />
                    <p className="text-[9px] uppercase tracking-widest text-taupe text-center py-1">Before</p>
                  </div>
                )}
                {appointment.afterPhotoUrl && (
                  <div className="flex-1 aspect-square overflow-hidden bg-nude/20">
                    <img src={appointment.afterPhotoUrl} alt="After" className="w-full h-full object-cover" />
                    <p className="text-[9px] uppercase tracking-widest text-taupe text-center py-1">After</p>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              {PERMISSION_ITEMS.filter((p) => perms[p.key]).map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-sage shrink-0" />
                  <span className="text-xs text-foreground">{p.title}</span>
                </div>
              ))}
              {PERMISSION_ITEMS.filter((p) => !perms[p.key]).map((p) => (
                <div key={p.key} className="flex items-center gap-2">
                  <span className="size-1.5 rounded-full bg-border shrink-0" />
                  <span className="text-xs text-taupe line-through">{p.title}</span>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-10 border-t hairline pt-6 flex flex-wrap items-center justify-between gap-4">
        <Link to="/appointments" className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
          ← Back to appointments
        </Link>
        <Link
          to="/generate"
          search={{ appointment: appointment.id }}
          className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors"
        >
          Generate content →
        </Link>
      </div>
    </div>
  );
}

function RequestView({ data }: { data: NonNullable<ReturnType<typeof useConsentRequest>["data"]> }) {
  const { appointment, status } = data;
  const [perms, setPerms] = useState<ConsentPermissions>({
    allowShowFace: true,
    allowUseName: true,
    allowTagSocial: false,
    allowPlatformPromotion: false,
    allowMarketingContent: true,
    allowInternalUse: false,
  });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const { data: brandDnaData } = useBrandDna();
  const isMedical = !!brandDnaData?.isMedicalAestheticsPractitioner;

  // Never let a proposed/saved request include allowShowFace for a medical
  // account, even if perms was set before the Brand DNA flag loaded.
  const effectivePerms: ConsentPermissions = isMedical ? { ...perms, allowShowFace: false } : perms;

  const handleGrant = async () => {
    if (!appointment.clientId) {
      toast.error("Client ID not found. Please refresh and try again.");
      return;
    }
    setSending(true);
    try {
      await api.post(`/clients/${appointment.clientId}/consent`, {
        allowShowFace: effectivePerms.allowShowFace,
        allowUseName: effectivePerms.allowUseName,
        allowTagSocial: effectivePerms.allowTagSocial,
        allowPlatformPromotion: effectivePerms.allowPlatformPromotion,
        allowInternalUse: effectivePerms.allowInternalUse,
        allowMarketingContent: effectivePerms.allowMarketingContent,
        consentMethod: "manual",
      });
      setSent(true);
      toast.success("Consent granted for " + appointment.clientName);
    } catch {
      toast.error("Failed to save consent. Try again.");
    } finally {
      setSending(false);
    }
  };

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <p className="eyebrow">Consent request</p>
          {status === "pending" && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">Pending client reply</span>
          )}
          {status === "not_requested" && (
            <span className="text-[9px] uppercase tracking-widest border hairline px-2 py-1 text-taupe">Not yet requested</span>
          )}
          {status === "declined" && (
            <span className="text-[9px] uppercase tracking-widest border hairline border-destructive px-2 py-1 text-destructive">Declined</span>
          )}
        </div>
        <h1 className="page-title">
          Ask <span className="italic">{appointment.clientName}</span> what's okay.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Select the permissions below and confirm in person, or send a branded consent request to the client.
        </p>
      </header>

      <div className="grid grid-cols-12 gap-8 lg:gap-10">
        {/* Permissions checklist */}
        <section className="col-span-12 lg:col-span-7">
          <h2 className="eyebrow mb-4">What you're asking the client to approve</h2>
          <div className="space-y-px bg-border mb-6">
            {PERMISSION_ITEMS.map((item) => {
              const locked = isMedical && item.key === MEDICAL_LOCKED_KEY;
              const on = effectivePerms[item.key];
              return (
                <label
                  key={item.key}
                  className={"bg-card p-5 flex items-start gap-4 transition-colors " + (locked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:bg-nude/20")}
                >
                  <div className={"flex items-center justify-center size-5 rounded-full border shrink-0 mt-0.5 transition-colors " + (on ? "bg-foreground border-foreground" : "border-border bg-transparent")}>
                    {on && (
                      <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                        <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </div>
                  <input
                    type="checkbox"
                    checked={on}
                    disabled={locked}
                    onChange={(e) => !locked && setPerms({ ...perms, [item.key]: e.target.checked })}
                    className="sr-only"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.title}</p>
                    <p className="text-xs text-taupe mt-1">{locked ? MEDICAL_LOCKED_HELP : item.help}</p>
                  </div>
                </label>
              );
            })}
          </div>

          {sent ? (
            <div className="flex items-center gap-3 p-4 bg-sage/10 border hairline border-sage">
              <span className="size-2 rounded-full bg-sage shrink-0" />
              <p className="text-sm text-sage">Consent granted and saved for {appointment.clientName}.</p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              <button
                onClick={handleGrant}
                disabled={sending}
                className="bg-foreground text-offwhite px-6 py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50"
              >
                {sending ? "Saving..." : "Confirm consent in person"}
              </button>
              <button
                disabled
                className="border hairline px-6 py-3 text-[11px] uppercase tracking-[0.22em] text-taupe cursor-not-allowed opacity-50"
                title="SMS/email sending coming soon"
              >
                Send to client
              </button>
            </div>
          )}
        </section>

        {/* Preview */}
        <aside className="col-span-12 lg:col-span-5">
          <p className="eyebrow mb-4">Preview · what {appointment.clientName.split(" ")[0]} will approve</p>
          <div className="artifact p-6">
            <p className="font-serif text-lg mb-1">A quick request</p>
            <p className="text-xs text-taupe mb-4">{appointment.service} · {appointment.date}</p>

            {appointment.afterPhotoUrl && (
              <div className="mb-4">
                <div className="aspect-[4/5] bg-nude/30 ring-1 ring-border overflow-hidden">
                  <img src={appointment.afterPhotoUrl} alt="" className="w-full h-full object-cover" />
                </div>
                {isMedical && (
                  <p className="text-[10px] text-taupe mt-1.5 italic">Session photo shown for reference only — medical aesthetics accounts never post client photos; generated content uses brand-safe imagery instead.</p>
                )}
              </div>
            )}

            <p className="text-sm leading-relaxed mb-4 text-taupe">
              I'd love to share a few photos from our session. Here's exactly what I'd use:
            </p>
            <ul className="space-y-2">
              {PERMISSION_ITEMS.filter((p) => effectivePerms[p.key]).map((p) => (
                <li key={p.key} className="flex items-start gap-2">
                  <span className="size-1.5 rounded-full bg-sage mt-1.5 shrink-0" />
                  <span className="text-xs">{p.title}</span>
                </li>
              ))}
              {PERMISSION_ITEMS.filter((p) => effectivePerms[p.key]).length === 0 && (
                <li className="text-xs italic text-taupe">No permissions selected.</li>
              )}
            </ul>
            <div className="mt-5 pt-4 border-t hairline flex gap-2">
              <span className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-2">Approve</span>
              <span className="text-[10px] uppercase tracking-widest border hairline px-3 py-2">Decline</span>
            </div>
          </div>
        </aside>
      </div>

      <div className="mt-10 border-t hairline pt-6">
        <Link to="/appointments" className="text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground">
          ← Back to appointments
        </Link>
      </div>
    </div>
  );
}

function ConsentPage() {
  const { id } = Route.useParams();
  const { data, error, notFound, loading } = useConsentRequest(id);

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

  if (data.status === "granted") {
    return <GrantedView data={data} />;
  }

  return <RequestView data={data} />;
}
