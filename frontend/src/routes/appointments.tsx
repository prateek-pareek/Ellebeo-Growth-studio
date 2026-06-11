import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useAppointments, type Appointment } from "@/lib/providers/appointments-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "Appointments — Elle.Be.O Growth" },
      { name: "description", content: "Capture before-and-after photos, manage client consent, and turn appointments into content." },
      { property: "og:title", content: "Appointments — Elle.Be.O Growth" },
    ],
  }),
  component: AppointmentsPage,
});

const CATEGORIES = [
  { value: "hair_colour",            label: "Colour" },
  { value: "hair_cut_style",         label: "Cut & Style" },
  { value: "hair_extensions",        label: "Extensions" },
  { value: "skin_treatments",        label: "Skin" },
  { value: "laser_treatments",       label: "Laser" },
  { value: "injectables_cosmetic",   label: "Medical Aesthetics" },
  { value: "nail_services",          label: "Nails" },
  { value: "lashes_brows",           label: "Lash & Brow" },
  { value: "makeup",                 label: "Makeup" },
  { value: "massage_body",           label: "Body" },
  { value: "general",                label: "General" },
];

function AppointmentsPage() {
  const [filter, setFilter] = useState<"all" | "consent" | "ready">("all");
  const { data: appointments, isEmpty, error, loading, refresh } = useAppointments();

  // Form state
  const [clientName, setClientName]   = useState("");
  const [serviceName, setServiceName] = useState("");
  const [category, setCategory]       = useState("hair_cut_style");
  const [isAdding, setIsAdding]       = useState(false);
  const [beforeFile, setBeforeFile]   = useState<File | null>(null);
  const [afterFile, setAfterFile]     = useState<File | null>(null);

  const uploadFile = async (appointmentId: string, file: File, isBefore: boolean) => {
    const form = new FormData();
    form.append("file", file);
    form.append("isBeforePhoto", String(isBefore));
    await api.post(`/appointments/${appointmentId}/images/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const checkImageSafety = async (file: File): Promise<boolean> => {
    const form = new FormData();
    form.append("file", file);
    await api.post("/appointments/check-image", form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return true;
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      if (beforeFile) {
        try {
          await checkImageSafety(beforeFile);
        } catch (err: any) {
          toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Before photo failed safety check");
          return;
        }
      }
      if (afterFile) {
        try {
          await checkImageSafety(afterFile);
        } catch (err: any) {
          toast.error(err.response?.data?.error?.message || err.response?.data?.message || "After photo failed safety check");
          return;
        }
      }

      const parts     = clientName.trim().split(/\s+/);
      const firstName = parts[0] || clientName;
      const lastName  = parts.slice(1).join(" ") || "Client";

      const clientRes = await api.post("/clients", { firstName, lastName });
      const clientId  = clientRes.data.data.id;

      const res  = await api.post("/appointments", {
        clientId,
        serviceCategory: category,
        serviceName,
        appointmentDate: new Date().toISOString(),
      });
      const appt = res.data.data;

      if (beforeFile) {
        try {
          await uploadFile(appt.id, beforeFile, true);
        } catch (uploadErr: any) {
          toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "Before photo upload failed");
          return;
        }
      }
      if (afterFile) {
        try {
          await uploadFile(appt.id, afterFile, false);
        } catch (uploadErr: any) {
          toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "After photo upload failed");
          return;
        }
      }

      toast.success("Appointment created successfully");
      setClientName("");
      setServiceName("");
      setBeforeFile(null);
      setAfterFile(null);
      if (refresh) refresh();
    } catch (e: any) {
      toast.error(e.response?.data?.message || "Failed to create appointment");
    } finally {
      setIsAdding(false);
    }
  };

  const filtered = appointments.filter((a) => {
    if (filter === "consent") return a.consent === "pending" || a.consent === "not_requested";
    if (filter === "ready")   return a.consent === "granted";
    return true;
  });

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="relative mt-6 lg:mt-10 mb-10 overflow-hidden border border-nude/60 bg-card p-6 sm:p-8 shadow-sm">
        <div
          className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-gradient-to-b from-taupe via-sage to-sage opacity-90"
          aria-hidden
        />
        <div className="pl-4 sm:pl-5 max-w-[68ch]">
          <p className="eyebrow mb-4">Appointments</p>
          <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
            Turn appointments into <span className="italic">content</span>.
          </h1>
          <p className="mt-5 text-base sm:text-lg text-taupe leading-relaxed">
            Upload before-and-after photos, request client consent, and let AI draft the post for you.
          </p>
        </div>
      </header>

      {/* ── New appointment form ─────────────────────────────────────────── */}
      <section className="border border-border bg-card shadow-sm overflow-hidden mb-12">
        {/* Card header */}
        <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">New appointment</h2>
          <span className="eyebrow">Capture</span>
        </div>

        <form onSubmit={handleAddAppointment} className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-12 items-start">
          {/* Left — details */}
          <div className="space-y-5">
            <p className="text-sm text-taupe leading-relaxed">
              Add the service details and upload your photos. We'll handle the rest.
            </p>

            {/* Client name */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Client name
              </label>
              <input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="e.g. Sarah J."
                required
                className="block w-full border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-taupe/60 outline-none focus:border-taupe focus:ring-2 focus:ring-taupe/10 transition-all"
              />
            </div>

            {/* Service */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Service
              </label>
              <input
                value={serviceName}
                onChange={(e) => setServiceName(e.target.value)}
                placeholder="e.g. Signature Glow Facial"
                required
                className="block w-full border border-border bg-muted/30 px-3 py-2.5 text-sm text-foreground placeholder:text-taupe/60 outline-none focus:border-taupe focus:ring-2 focus:ring-taupe/10 transition-all"
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Category
              </label>
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.value}
                    type="button"
                    onClick={() => setCategory(c.value)}
                    className={
                      "text-[10px] uppercase tracking-widest px-3 py-1.5 border transition-colors " +
                      (category === c.value
                        ? "bg-foreground text-offwhite border-foreground"
                        : "border-border text-taupe hover:text-foreground hover:border-taupe")
                    }
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Right — photos + submit */}
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <PhotoUpload
                label="Before photo"
                file={beforeFile}
                onChange={setBeforeFile}
              />
              <PhotoUpload
                label="After photo"
                file={afterFile}
                onChange={setAfterFile}
              />
            </div>

            <button
              type="submit"
              disabled={isAdding}
              className="w-full bg-foreground text-offwhite py-3 text-[11px] uppercase hover:bg-taupe transition-colors disabled:opacity-50"
            >
              <span className="tracking-[0.22em] -mr-[0.22em]">
                {isAdding ? "Creating…" : "Create Appointment"}
              </span>
            </button>
          </div>
        </form>
      </section>

      {/* ── Appointments table ───────────────────────────────────────────── */}
      <div className="border border-border bg-card shadow-sm overflow-hidden">
        {/* Table toolbar */}
        <div className="bg-muted px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Recent appointments
            </h2>
            {!error && !loading && !isEmpty && (
              <span className="text-[9px] uppercase tracking-widest text-sage">Live</span>
            )}
            {loading && (
              <span className="text-[9px] uppercase tracking-widest text-taupe">Loading…</span>
            )}
          </div>
          {/* Filter tabs */}
          <div className="flex items-center divide-x divide-border border border-border">
            {[
              { id: "all",     label: "All" },
              { id: "consent", label: "Consent needed" },
              { id: "ready",   label: "Ready" },
            ].map((f) => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id as typeof filter)}
                className={
                  "px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors " +
                  (filter === f.id
                    ? "bg-foreground text-offwhite"
                    : "text-taupe hover:text-foreground hover:bg-nude/30")
                }
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {isEmpty && !loading ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-12 text-center bg-muted/20">
            <p className="eyebrow mb-3">No appointments yet</p>
            <p className="text-sm text-taupe leading-relaxed max-w-md">
              Add your first appointment above to start turning sessions into content.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm" style={{ minWidth: "700px" }}>
              <thead className="bg-muted border-b border-border text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                <tr>
                  <th className="px-5 py-3 w-[120px]">Photos</th>
                  <th className="px-5 py-3">Client · Service</th>
                  <th className="px-5 py-3 w-[160px]">Date · Category</th>
                  <th className="px-5 py-3 w-[170px]">Consent</th>
                  <th className="px-5 py-3 w-[170px] text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map((a) => (
                  <AppointmentRow key={a.id} a={a} />
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-8 text-center text-sm text-taupe italic">
                      No appointments match this filter.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function PhotoUpload({
  label,
  file,
  onChange,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <div className="aspect-square border border-border bg-muted/30 flex items-center justify-center relative overflow-hidden group hover:border-taupe transition-colors">
        {file ? (
          <img src={URL.createObjectURL(file)} className="w-full h-full object-cover" alt={label} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-taupe group-hover:text-foreground transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span className="text-[9px] uppercase tracking-widest">Upload</span>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          onChange={(e) => onChange(e.target.files?.[0] || null)}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>
    </div>
  );
}

function AppointmentRow({ a }: { a: Appointment }) {
  return (
    <tr className="text-foreground hover:bg-nude/20 transition-colors">
      {/* Photos */}
      <td className="px-5 py-4">
        <div className="flex gap-1.5">
          <div className="size-12 bg-nude/20 border border-border overflow-hidden shrink-0">
            {a.beforePhotoUrl ? (
              <img src={a.beforePhotoUrl} alt="Before" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[8px] uppercase tracking-widest text-taupe">B</div>
            )}
          </div>
          <div className="size-12 bg-nude/20 border border-border overflow-hidden shrink-0">
            {a.afterPhotoUrl ? (
              <img src={a.afterPhotoUrl} alt="After" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[8px] uppercase tracking-widest text-taupe">A</div>
            )}
          </div>
        </div>
      </td>

      {/* Client · Service */}
      <td className="px-5 py-4">
        <p className="font-serif text-base leading-tight mb-0.5">{a.clientName}</p>
        <p className="text-xs text-taupe truncate max-w-[22ch]">{a.service}</p>
        {a.notes && (
          <p className="text-xs text-taupe mt-1 line-clamp-1 max-w-[26ch] leading-relaxed">{a.notes}</p>
        )}
        {a.contentReady > 0 && (
          <Link to="/content" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mt-1 block">
            {a.contentReady} draft{a.contentReady !== 1 ? "s" : ""} ready →
          </Link>
        )}
      </td>

      {/* Date · Category */}
      <td className="px-5 py-4">
        <p className="text-xs text-foreground">{a.date}</p>
        <p className="text-[10px] uppercase tracking-widest text-taupe mt-0.5">{a.category}</p>
      </td>

      {/* Consent */}
      <td className="px-5 py-4">
        <ConsentBadge status={a.consent} />
      </td>

      {/* Action */}
      <td className="px-5 py-4 text-right">
        {a.consent === "granted" ? (
          <Link
            to="/generate"
            search={{ appointment: a.id }}
            className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
          >
            Turn into content
          </Link>
        ) : a.consent === "pending" ? (
          <Link
            to="/consent/$id"
            params={{ id: a.id }}
            className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Resend consent
          </Link>
        ) : a.consent === "not_requested" ? (
          <Link
            to="/consent/$id"
            params={{ id: a.id }}
            className="inline-flex items-center gap-1.5 bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
            </svg>
            Request consent
          </Link>
        ) : (
          <span className="inline-flex items-center gap-1.5 border border-destructive/30 bg-destructive/5 text-destructive text-xs font-medium px-3.5 py-2">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
            Declined
          </span>
        )}
      </td>
    </tr>
  );
}

function ConsentBadge({ status }: { status: Appointment["consent"] }) {
  const map: Record<Appointment["consent"], { label: string; help: string; badge: string }> = {
    granted:       { label: "Granted",      help: "Photos and quotes can be used.",  badge: "text-sage bg-sage/10" },
    pending:       { label: "Pending",       help: "Waiting on client reply.",         badge: "text-taupe bg-taupe/10" },
    declined:      { label: "Declined",      help: "Do not use this content.",         badge: "text-destructive bg-destructive/10" },
    not_requested: { label: "Required",      help: "Send a request to the client.",    badge: "text-foreground bg-muted" },
  };
  const m = map[status];
  return (
    <div>
      <span className={`inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 mb-1 ${m.badge}`}>
        {m.label}
      </span>
      <p className="text-xs text-taupe leading-snug">{m.help}</p>
    </div>
  );
}
