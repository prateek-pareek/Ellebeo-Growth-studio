import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAppointments, type Appointment } from "@/lib/providers/appointments-provider";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Send } from "lucide-react";
import { Pagination } from "@/components/Pagination";

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

type AssetLibraryItem = {
  storage_path: string;
  asset_type: string;
  usage_rule?: string;
  consent_status?: string;
};

const EXCLUDED_USAGE = new Set(["do_not_generate", "do_not_use_publicly", "private_ref"]);
const EXCLUDED_CONSENT = new Set(["no_consent", "pending"]);

const PAGE_SIZE = 15;

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
  const [page, setPage] = useState(1);
  const { data: appointments, isEmpty, error, loading, refresh } = useAppointments();

  // Form state
  const [clientName, setClientName]   = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [serviceName, setServiceName] = useState("");
  const [category, setCategory]       = useState("hair_cut_style");
  const [isAdding, setIsAdding]       = useState(false);
  const [beforeFile, setBeforeFile]   = useState<File | null>(null);
  const [afterFile, setAfterFile]     = useState<File | null>(null);
  const [beforeAssetPath, setBeforeAssetPath] = useState<string | null>(null);
  const [afterAssetPath, setAfterAssetPath]   = useState<string | null>(null);
  const [assetLibrary, setAssetLibrary]       = useState<AssetLibraryItem[]>([]);
  const [isMedicalAesthetics, setIsMedicalAesthetics] = useState(false);
  const [medicalFiles, setMedicalFiles]       = useState<File[]>([]);

  useEffect(() => {
    api.get("/brand-dna")
      .then((res) => {
        const dna = res.data?.data;
        const v2 = typeof dna?.brandDnaV2 === "string" ? JSON.parse(dna.brandDnaV2) : dna?.brandDnaV2;
        setIsMedicalAesthetics(v2?.compliance?.medical_aesthetics_practitioner === true);
        const items: AssetLibraryItem[] = Array.isArray(v2?.asset_library) ? v2.asset_library : [];
        setAssetLibrary(
          items.filter(
            (i) => i.storage_path && !EXCLUDED_USAGE.has(i.usage_rule || "") && !EXCLUDED_CONSENT.has(i.consent_status || "")
          )
        );
      })
      .catch(() => setAssetLibrary([]));
  }, []);

  const uploadFile = async (appointmentId: string, file: File, isBefore: boolean) => {
    const form = new FormData();
    form.append("file", file);
    form.append("isBeforePhoto", String(isBefore));
    await api.post(`/appointments/${appointmentId}/images/upload`, form, {
      headers: { "Content-Type": "multipart/form-data" },
    });
  };

  const attachAssetLibraryImage = async (appointmentId: string, storagePath: string, isBefore: boolean) => {
    await api.post(`/appointments/${appointmentId}/images/from-asset-library`, {
      storagePath,
      isBeforePhoto: isBefore,
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
    const isMedicalForm = isMedicalAesthetics && category === "injectables_cosmetic";
    try {
      if (isMedicalForm) {
        for (const f of medicalFiles) {
          try { await checkImageSafety(f); } 
          catch (err: any) {
            toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Photo failed safety check");
            setIsAdding(false);
            return;
          }
        }
      } else {
        if (beforeFile) {
          try {
            await checkImageSafety(beforeFile);
          } catch (err: any) {
            toast.error(err.response?.data?.error?.message || err.response?.data?.message || "Before photo failed safety check");
            setIsAdding(false);
            return;
          }
        }
        if (afterFile) {
          try {
            await checkImageSafety(afterFile);
          } catch (err: any) {
            toast.error(err.response?.data?.error?.message || err.response?.data?.message || "After photo failed safety check");
            setIsAdding(false);
            return;
          }
        }
      }

      const parts     = clientName.trim().split(/\s+/);
      const firstName = parts[0] || clientName;
      const lastName  = parts.slice(1).join(" ") || "Client";

      const clientRes = await api.post("/clients", {
        firstName,
        lastName,
        ...(clientPhone.trim() ? { phone: clientPhone.trim() } : {}),
      });
      const clientId  = clientRes.data.data.id;

      const res  = await api.post("/appointments", {
        clientId,
        serviceCategory: category,
        serviceName,
        appointmentDate: new Date().toISOString(),
      });
      const appt = res.data.data;

      if (isMedicalForm) {
        for (let i = 0; i < medicalFiles.length; i++) {
          try {
            await uploadFile(appt.id, medicalFiles[i], false);
          } catch (uploadErr: any) {
            toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "Photo upload failed");
            setIsAdding(false);
            return;
          }
        }
      } else {
        if (beforeFile) {
          try {
            await uploadFile(appt.id, beforeFile, true);
          } catch (uploadErr: any) {
            toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "Before photo upload failed");
            setIsAdding(false);
            return;
          }
        } else if (beforeAssetPath) {
          try {
            await attachAssetLibraryImage(appt.id, beforeAssetPath, true);
          } catch (uploadErr: any) {
            toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "Before photo (asset library) attach failed");
            setIsAdding(false);
            return;
          }
        }
        if (afterFile) {
          try {
            await uploadFile(appt.id, afterFile, false);
          } catch (uploadErr: any) {
            toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "After photo upload failed");
            setIsAdding(false);
            return;
          }
        } else if (afterAssetPath) {
          try {
            await attachAssetLibraryImage(appt.id, afterAssetPath, false);
          } catch (uploadErr: any) {
            toast.error(uploadErr.response?.data?.error?.message || uploadErr.response?.data?.message || "After photo (asset library) attach failed");
            setIsAdding(false);
            return;
          }
        }
      }

      toast.success("Appointment created successfully");
      setClientName("");
      setClientPhone("");
      setServiceName("");
      setBeforeFile(null);
      setAfterFile(null);
      setBeforeAssetPath(null);
      setAfterAssetPath(null);
      setMedicalFiles([]);
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

  // Reset to page 1 whenever the result set changes shape
  useEffect(() => { setPage(1); }, [filter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  useEffect(() => { if (page > totalPages) setPage(totalPages); }, [page, totalPages]);
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Appointments</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage animate-pulse" />
            Live
          </span>
        </div>
        <h1 className="page-title max-w-[22ch]">
          Turn appointments into <span className="italic text-taupe">content</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Upload photos, request client consent (if applicable), and let AI draft the post.
        </p>
      </header>

      {/* ── New appointment form ─────────────────────────────────────────── */}
      <section className="border border-border bg-card shadow-sm overflow-hidden mb-8">
        {/* Card header */}
        <div className="bg-muted px-5 py-3 border-b border-border flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">New appointment</h2>
          <span className="eyebrow">Capture</span>
        </div>

        <form onSubmit={handleAddAppointment} className="p-6 sm:p-8 grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 items-start">
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

            {/* Client phone */}
            <div className="space-y-1.5">
              <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                Client phone <span className="normal-case tracking-normal font-normal text-taupe/50">(optional, for SMS)</span>
              </label>
              <input
                value={clientPhone}
                onChange={(e) => setClientPhone(e.target.value)}
                placeholder="e.g. +919876543210"
                type="tel"
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
            {isMedicalAesthetics && category === "injectables_cosmetic" ? (
              <div className="space-y-1.5">
                <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  Upload Photos ({medicalFiles.length} selected)
                </label>
                <div className="border border-border bg-muted/30 flex items-center justify-center relative overflow-hidden transition-colors min-h-32">
                  {medicalFiles.length > 0 ? (
                    <div className="grid grid-cols-3 gap-2 p-2 w-full">
                      {medicalFiles.map((f, i) => (
                        <div key={i} className="aspect-square relative overflow-hidden border border-border bg-black/5 group/img">
                          <img src={URL.createObjectURL(f)} className="w-full h-full object-cover" alt={`Upload ${i+1}`} />
                          <button
                            type="button"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setMedicalFiles(prev => prev.filter((_, index) => index !== i));
                            }}
                            className="absolute top-1 right-1 size-6 flex items-center justify-center bg-black/50 text-white rounded-full opacity-0 group-hover/img:opacity-100 transition-opacity z-20 hover:bg-black/70"
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                              <line x1="18" y1="6" x2="6" y2="18" />
                              <line x1="6" y1="6" x2="18" y2="18" />
                            </svg>
                          </button>
                        </div>
                      ))}
                      <label className="aspect-square flex flex-col items-center justify-center border border-dashed border-border hover:border-taupe cursor-pointer text-taupe hover:text-foreground transition-colors bg-muted/50">
                        <span className="text-[10px] uppercase tracking-widest">+ Add</span>
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => {
                            if (e.target.files) {
                              setMedicalFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                            }
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center gap-2 text-taupe hover:text-foreground transition-colors py-8 cursor-pointer w-full h-full">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                      </svg>
                      <span className="text-[9px] uppercase tracking-widest">Select Photos</span>
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={(e) => {
                          if (e.target.files) {
                            setMedicalFiles(Array.from(e.target.files));
                          }
                        }}
                        className="hidden"
                      />
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <PhotoUpload
                  label="Before photo"
                  file={beforeFile}
                  onChange={(f) => { setBeforeFile(f); if (f) setBeforeAssetPath(null); }}
                  assetLibrary={assetLibrary}
                  selectedAssetPath={beforeAssetPath}
                  onSelectAsset={(path) => { setBeforeAssetPath(path); setBeforeFile(null); }}
                />
                <PhotoUpload
                  label="After photo"
                  file={afterFile}
                  onChange={(f) => { setAfterFile(f); if (f) setAfterAssetPath(null); }}
                  assetLibrary={assetLibrary}
                  selectedAssetPath={afterAssetPath}
                  onSelectAsset={(path) => { setAfterAssetPath(path); setAfterFile(null); }}
                />
              </div>
            )}

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
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-10 text-center bg-muted/20">
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
                {pageItems.map((a) => (
                  <AppointmentRow key={a.id} a={a} onReminderSent={refresh} isMedicalAesthetics={isMedicalAesthetics} />
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
        {filtered.length > PAGE_SIZE && (
          <div className="px-5 pb-5">
            <Pagination
              page={page}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onChange={setPage}
            />
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
  assetLibrary = [],
  selectedAssetPath = null,
  onSelectAsset,
}: {
  label: string;
  file: File | null;
  onChange: (f: File | null) => void;
  assetLibrary?: AssetLibraryItem[];
  selectedAssetPath?: string | null;
  onSelectAsset?: (path: string) => void;
}) {
  const [showLibrary, setShowLibrary] = useState(false);

  return (
    <div className="space-y-1.5">
      <label className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {label}
      </label>
      <div className="border border-border bg-muted/30 flex items-center justify-center relative overflow-hidden group hover:border-taupe transition-colors min-h-32">
        {file ? (
          <img src={URL.createObjectURL(file)} className="w-full h-auto block" alt={label} />
        ) : selectedAssetPath ? (
          <img src={selectedAssetPath} className="w-full h-auto block" alt={label} />
        ) : (
          <div className="flex flex-col items-center gap-2 text-taupe group-hover:text-foreground transition-colors py-8">
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

      {assetLibrary.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowLibrary((v) => !v)}
            className="text-[9px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
          >
            {selectedAssetPath ? "Change library photo" : "Or pick from asset library"}
          </button>
          {showLibrary && (
            <div className="mt-1.5 grid grid-cols-4 gap-1.5 border border-border bg-card p-1.5">
              {assetLibrary.map((item) => (
                <button
                  key={item.storage_path}
                  type="button"
                  onClick={() => { onSelectAsset?.(item.storage_path); setShowLibrary(false); }}
                  className={
                    "size-12 overflow-hidden border transition-colors " +
                    (selectedAssetPath === item.storage_path ? "border-foreground" : "border-border hover:border-taupe")
                  }
                  title={item.asset_type}
                >
                  <img src={item.storage_path} className="w-full h-full object-cover" alt={item.asset_type} />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AppointmentRow({ a, onReminderSent, isMedicalAesthetics }: { a: Appointment; onReminderSent?: () => void; isMedicalAesthetics?: boolean }) {
  const [sending, setSending] = useState(false);
  const [showPhoneInput, setShowPhoneInput] = useState(false);
  const [phone, setPhone] = useState("");
  const [savingPhone, setSavingPhone] = useState(false);

  const isMedicalRow = isMedicalAesthetics && a.category === "Medical Aesthetics";

  const handleSendReminder = async () => {
    setSending(true);
    try {
      const res = await api.post(`/appointments/${a.id}/send-consent-reminder`);
      const data = res.data?.data ?? res.data;
      if (data?.sent === false) {
        setShowPhoneInput(true);
        toast.warning("No phone number on file — add one below to send SMS.");
      } else {
        toast.success("Consent reminder sent via SMS.");
        onReminderSent?.();
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Failed to send reminder.");
    } finally {
      setSending(false);
    }
  };

  const handleSavePhone = async () => {
    if (!phone.trim() || !a.clientId) return;
    setSavingPhone(true);
    try {
      await api.patch(`/clients/${a.clientId}`, { phone: phone.trim() });
      toast.success("Phone number saved.");
      setShowPhoneInput(false);
      setPhone("");
      // Now retry sending the reminder
      const res = await api.post(`/appointments/${a.id}/send-consent-reminder`);
      const data = res.data?.data ?? res.data;
      if (data?.sent !== false) {
        toast.success("Consent reminder sent via SMS.");
        onReminderSent?.();
      }
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Failed to save phone number.");
    } finally {
      setSavingPhone(false);
    }
  };

  return (
    <tr className="text-foreground hover:bg-nude/20 transition-colors">
      {/* Photos */}
      <td className="px-5 py-4">
        <div className="flex gap-1.5">
          {isMedicalRow ? (
            <div className="size-12 bg-nude/20 border border-border overflow-hidden shrink-0">
              {a.afterPhotoUrl || a.beforePhotoUrl ? (
                <img src={(a.afterPhotoUrl || a.beforePhotoUrl) as string} alt="Photo" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-[8px] uppercase tracking-widest text-taupe">IMG</div>
              )}
            </div>
          ) : (
            <>
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
            </>
          )}
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
        {isMedicalRow ? (
          <span className="text-[10px] uppercase tracking-widest text-taupe">N/A</span>
        ) : (
          <ConsentBadge status={a.consent} />
        )}
      </td>

      {/* Action */}
      <td className="px-5 py-4 text-right">
        {showPhoneInput && (
          <div className="flex items-center gap-2 mb-2 justify-end">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="+91 98765 43210"
              className="border border-border bg-muted/30 px-2 py-1.5 text-xs text-foreground placeholder:text-taupe/50 outline-none focus:border-taupe w-36"
            />
            <button
              onClick={handleSavePhone}
              disabled={!phone.trim() || savingPhone}
              className="text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-3 py-1.5 disabled:opacity-50"
            >
              {savingPhone ? "Saving…" : "Save & Send"}
            </button>
          </div>
        )}
        {isMedicalAesthetics || a.consent === "granted" ? (
          <Link
            to="/generate"
            search={{ appointment: a.id }}
            className="inline-flex items-center bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all"
          >
            Turn into content
          </Link>
        ) : a.consent === "pending" ? (
          <div className="flex flex-col items-end gap-1.5">
            <button
              type="button"
              onClick={handleSendReminder}
              disabled={sending}
              className="inline-flex items-center gap-1.5 bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              <Send className="size-3" />
              {sending ? "Sending…" : "Send reminder"}
            </button>
            <Link
              to="/consent/$id"
              params={{ id: a.id }}
              className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors"
            >
              View consent →
            </Link>
          </div>
        ) : a.consent === "not_requested" ? (
          <div className="flex flex-col items-end gap-1.5">
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
            <button
              type="button"
              onClick={handleSendReminder}
              disabled={sending}
              className="inline-flex items-center gap-1.5 border border-border bg-card text-[10px] font-medium text-taupe px-3 py-1.5 hover:text-foreground hover:bg-nude/30 active:scale-[0.97] transition-all disabled:opacity-50"
            >
              <Send className="size-3" />
              {sending ? "Sending…" : "Send SMS reminder"}
            </button>
          </div>
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
