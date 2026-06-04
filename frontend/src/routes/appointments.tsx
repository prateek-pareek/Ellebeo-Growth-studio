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

function AppointmentsPage() {
  const [filter, setFilter] = useState<"all" | "consent" | "ready">("all");
  const { data: appointments, isEmpty, error, loading, refresh } = useAppointments();
  
  // Form state
  const [clientName, setClientName] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [category, setCategory] = useState("hair_cut_style");
  const [isAdding, setIsAdding] = useState(false);
  const [beforeFile, setBeforeFile] = useState<File | null>(null);
  const [afterFile, setAfterFile] = useState<File | null>(null);

  const uploadFile = async (appointmentId: string, file: File, isBefore: boolean) => {
    const form = new FormData();
    form.append('file', file);
    form.append('isBeforePhoto', String(isBefore));
    await api.post(`/appointments/${appointmentId}/images/upload`, form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  };

  const checkImageSafety = async (file: File): Promise<boolean> => {
    const form = new FormData();
    form.append('file', file);
    await api.post('/appointments/check-image', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return true;
  };

  const handleAddAppointment = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAdding(true);
    try {
      // Validate images FIRST — before creating any records
      if (beforeFile) {
        try {
          await checkImageSafety(beforeFile);
        } catch (err: any) {
          const msg = err.response?.data?.error?.message || err.response?.data?.message || "Before photo failed safety check";
          toast.error(msg);
          return;
        }
      }
      if (afterFile) {
        try {
          await checkImageSafety(afterFile);
        } catch (err: any) {
          const msg = err.response?.data?.error?.message || err.response?.data?.message || "After photo failed safety check";
          toast.error(msg);
          return;
        }
      }

      // Split "Sarah J." → firstName="Sarah", lastName="J."
      const parts = clientName.trim().split(/\s+/);
      const firstName = parts[0] || clientName;
      const lastName = parts.slice(1).join(' ') || 'Client';

      // 1. Create the client
      const clientRes = await api.post('/clients', { firstName, lastName });
      const clientId = clientRes.data.data.id;

      // 2. Create appointment — no consent yet, starts as not_requested
      const res = await api.post('/appointments', {
        clientId,
        serviceCategory: category,
        serviceName,
        appointmentDate: new Date().toISOString(),
      });
      const appt = res.data.data;

      // 4. Upload photos — moderation errors are shown to the user and block completion
      if (beforeFile) {
        try {
          await uploadFile(appt.id, beforeFile, true);
        } catch (uploadErr: any) {
          const msg = uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "Before photo upload failed";
          toast.error(msg);
          return;
        }
      }
      if (afterFile) {
        try {
          await uploadFile(appt.id, afterFile, false);
        } catch (uploadErr: any) {
          const msg = uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "After photo upload failed";
          toast.error(msg);
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
    if (filter === "ready") return a.consent === "granted";
    return true;
  });

  return (
    <div>
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">Appointments</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Turn appointments into <span className="italic">content</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Upload before-and-after photos, request client consent, and let AI draft the post for you.
        </p>
      </header>

      {/* Intake form */}
      <section className="artifact p-6 sm:p-10 mb-12">
        <form onSubmit={handleAddAppointment} className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-10 items-start">
          <div>
            <p className="eyebrow mb-3">New appointment</p>
            <h2 className="font-serif text-2xl mb-3">Capture or upload photos</h2>
            <p className="text-sm text-taupe leading-relaxed mb-6">
              Add the service details and upload your photos. We'll handle the rest.
            </p>
            
            <div className="space-y-4">
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-taupe">Client Name</label>
                <input 
                  value={clientName} 
                  onChange={e => setClientName(e.target.value)} 
                  placeholder="e.g. Sarah J."
                  className="w-full bg-transparent border-b hairline py-1 outline-none focus:border-foreground"
                  required
                />
              </div>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-widest text-taupe">Service</label>
                <input
                  value={serviceName}
                  onChange={e => setServiceName(e.target.value)}
                  placeholder="e.g. Signature Glow Facial"
                  className="w-full bg-transparent border-b hairline py-1 outline-none focus:border-foreground"
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-taupe">Category</label>
                <div className="flex flex-wrap gap-2">
                  {[
                    { value: "hair_colour", label: "Colour" },
                    { value: "hair_cut_style", label: "Cut & Style" },
                    { value: "hair_extensions", label: "Extensions" },
                    { value: "skin_treatments", label: "Skin" },
                    { value: "laser_treatments", label: "Laser" },
                    { value: "injectables_cosmetic", label: "Medical Aesthetics" },
                    { value: "nail_services", label: "Nails" },
                    { value: "lashes_brows", label: "Lash & Brow" },
                    { value: "makeup", label: "Makeup" },
                    { value: "massage_body", label: "Body" },
                    { value: "general", label: "General" },
                  ].map((c) => (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={
                        "text-[10px] uppercase tracking-widest px-3 py-1.5 border hairline transition-colors " +
                        (category === c.value
                          ? "bg-foreground text-offwhite border-foreground"
                          : "text-taupe hover:text-foreground hover:border-foreground")
                      }
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          <div className="space-y-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-taupe">Before Photo</label>
                <div className="aspect-square border hairline bg-card/40 flex items-center justify-center relative overflow-hidden group">
                  {beforeFile ? (
                    <img src={URL.createObjectURL(beforeFile)} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] uppercase tracking-widest text-taupe">Upload</span>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setBeforeFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] uppercase tracking-widest text-taupe">After Photo</label>
                <div className="aspect-square border hairline bg-card/40 flex items-center justify-center relative overflow-hidden group">
                  {afterFile ? (
                    <img src={URL.createObjectURL(afterFile)} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-[9px] uppercase tracking-widest text-taupe">Upload</span>
                  )}
                  <input 
                    type="file" 
                    accept="image/*" 
                    onChange={e => setAfterFile(e.target.files?.[0] || null)}
                    className="absolute inset-0 opacity-0 cursor-pointer"
                  />
                </div>
              </div>
            </div>
            
            <button 
              type="submit" 
              disabled={isAdding}
              className="w-full bg-foreground text-offwhite py-3 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-50"
            >
              {isAdding ? "Creating..." : "Create Appointment"}
            </button>
          </div>
        </form>
      </section>

      {/* Filters */}
      <div className="flex items-baseline justify-between mb-6">
        <div className="flex items-baseline gap-3">
          <h2 className="eyebrow">Recent appointments</h2>
          {!error && !loading && !isEmpty && (
            <span className="text-[9px] uppercase tracking-widest text-sage">Live</span>
          )}
          {loading && (
            <span className="text-[9px] uppercase tracking-widest text-taupe">Loading…</span>
          )}
        </div>
        <div className="flex gap-5">
          {[
            { id: "all", label: "All" },
            { id: "consent", label: "Consent needed" },
            { id: "ready", label: "Ready for content" },
          ].map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id as typeof filter)}
              className={
                "text-[11px] uppercase tracking-[0.2em] pb-1 transition-colors " +
                (filter === f.id ? "text-foreground border-b border-foreground" : "text-taupe hover:text-foreground")
              }
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {isEmpty && !loading ? (
        <div className="artifact p-10 text-center">
          <p className="eyebrow mb-3">No appointments yet</p>
          <p className="text-sm text-taupe leading-relaxed max-w-md mx-auto">
            Add your first appointment above to start turning sessions into content.
          </p>
        </div>
      ) : (
        <div className="space-y-px bg-border">
          {filtered.map((a) => (
            <AppointmentRow key={a.id} a={a} />
          ))}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({ a }: { a: Appointment }) {
  return (
    <div className="bg-card p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
      <div className="sm:col-span-2 flex gap-2">
        <div className="size-20 bg-nude/20 ring-1 ring-border overflow-hidden flex-shrink-0">
          {a.beforePhotoUrl ? (
            <img src={a.beforePhotoUrl} alt="Before" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[9px] uppercase tracking-widest text-taupe">Before</div>
          )}
        </div>
        <div className="size-20 bg-nude/20 ring-1 ring-border overflow-hidden flex-shrink-0">
          {a.afterPhotoUrl ? (
            <img src={a.afterPhotoUrl} alt="After" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-[9px] uppercase tracking-widest text-taupe">After</div>
          )}
        </div>
      </div>

      <div className="sm:col-span-4 min-w-0">
        <p className="eyebrow mb-1">{a.date} · {a.category}</p>
        <p className="font-serif text-xl mb-1">{a.clientName}</p>
        <p className="text-xs text-taupe truncate">{a.service}</p>
        {a.notes && <p className="text-xs text-taupe mt-2 line-clamp-2 leading-relaxed">{a.notes}</p>}
      </div>

      <div className="sm:col-span-3">
        <ConsentRow status={a.consent} />
      </div>

      <div className="sm:col-span-3 flex flex-col items-start sm:items-end gap-2">
        {a.consent === "granted" ? (
          <Link
            to="/generate"
            search={{ appointment: a.id }}
            className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
          >
            Turn into content
          </Link>
        ) : a.consent === "pending" ? (
          <Link
            to="/consent/$id"
            params={{ id: a.id }}
            className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card"
          >
            Resend consent
          </Link>
        ) : a.consent === "not_requested" ? (
          <Link
            to="/consent/$id"
            params={{ id: a.id }}
            className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2"
          >
            Request consent
          </Link>
        ) : (
          <span className="text-[10px] uppercase tracking-widest text-destructive">Consent declined</span>
        )}
        {a.contentReady > 0 && (
          <Link to="/content" className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground">
            {a.contentReady} drafts ready →
          </Link>
        )}
      </div>
    </div>
  );
}

function ConsentRow({ status }: { status: Appointment["consent"] }) {
  const map: Record<Appointment["consent"], { label: string; cls: string; help: string }> = {
    granted: { label: "Consent granted", cls: "text-sage", help: "Photos and quotes can be used." },
    pending: { label: "Consent pending", cls: "text-foreground", help: "Waiting on client reply." },
    declined: { label: "Consent declined", cls: "text-destructive", help: "Do not use this content." },
    not_requested: { label: "Consent required", cls: "text-taupe", help: "Send a request to the client." },
  };
  const m = map[status];
  return (
    <div>
      <p className={"text-[10px] uppercase tracking-widest mb-1 " + m.cls}>{m.label}</p>
      <p className="text-xs text-taupe">{m.help}</p>
    </div>
  );
}
