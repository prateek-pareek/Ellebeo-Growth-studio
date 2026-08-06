import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Download, Layers, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "CRM Bookings — Elle.Be.O Growth" },
      {
        name: "description",
        content: "Browse and import bookings from your Client CRM into Growth Studio.",
      },
    ],
  }),
  component: CrmPage,
});

type ConsentData = Record<string, unknown>;

interface CrmBooking {
  id: string;
  technicianId: string;
  recipientName: string | null;
  recipientEmail: string | null;
  recipientPhone: string | null;
  category: string | null;
  serviceName: string | null;
  confirmedStartTime: string | null;
  recipientConsentData: ConsentData | null;
  marketingImageConsent: boolean;
  imported: boolean;
  appointmentId: string | null;
}

interface ListResponse {
  bookings: CrmBooking[];
  total: number;
  technicianFound: boolean;
}

type FilterTab = "all" | "available" | "imported";

const PAGE_SIZE = 20;

function CrmPage() {
  const [tab, setTab] = useState<FilterTab>("all");
  const [bookings, setBookings] = useState<CrmBooking[]>([]);
  const [total, setTotal] = useState(0);
  const [technicianFound, setTechnicianFound] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const [importingId, setImportingId] = useState<string | null>(null);
  const [importingAll, setImportingAll] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchBookings = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: ListResponse }>(
        `/crm/bookings?limit=${PAGE_SIZE}&offset=${off}`,
      );
      const body = res.data.data;
      setBookings(body.bookings);
      setTotal(body.total);
      setTechnicianFound(body.technicianFound);
      setOffset(off);
    } catch (e: any) {
      setError(e.response?.data?.message ?? "Failed to load CRM bookings.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchBookings(0);
  }, [fetchBookings]);

  const handleImport = async (bookingId: string) => {
    setImportingId(bookingId);
    try {
      await api.post(`/crm/bookings/${bookingId}/import`);
      toast.success("Booking imported as appointment");
      fetchBookings(offset);
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Import failed");
    } finally {
      setImportingId(null);
    }
  };

  const handleImportAll = async () => {
    setImportingAll(true);
    try {
      const res = await api.post<{ data: { status: string }[] }>("/crm/bookings/import-all");
      const results = res.data.data ?? [];
      const imported = results.filter((r) => r.status === "imported").length;
      const skipped = results.filter((r) => r.status === "already_imported").length;
      const failed = results.filter((r) => r.status === "failed").length;
      toast.success(`${imported} imported · ${skipped} already done · ${failed} failed`);
      fetchBookings(offset);
    } catch (e: any) {
      toast.error(e.response?.data?.message ?? "Bulk import failed");
    } finally {
      setImportingAll(false);
    }
  };

  const filtered = bookings.filter((b) => {
    if (tab === "available") return !b.imported;
    if (tab === "imported") return b.imported;
    return true;
  });

  const counts = {
    all: bookings.length,
    available: bookings.filter((b) => !b.imported).length,
    imported: bookings.filter((b) => b.imported).length,
  };

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-6">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">
            Bookings
          </span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage animate-pulse" />
            Live
          </span>
        </div>
        <h1 className="page-title max-w-[22ch]">
          Bookings from your <span className="italic text-brass-ink">Client CRM</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Browse bookings, import them into Growth Studio, and turn each session into content.
        </p>
      </header>

      {/* ── Overview + import all ────────────────────────────────────────── */}
      {!loading && !error && (
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div className="bg-card rounded-2xl p-5 shadow-elevated">
            <span className="flex items-center justify-center size-8 rounded-lg bg-brass/10 text-brass-ink mb-3">
              <Layers className="size-4" />
            </span>
            <p className="stat-figure tnum">{total}</p>
            <p className="text-xs text-taupe mt-1">Total CRM bookings</p>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-elevated">
            <span className="flex items-center justify-center size-8 rounded-lg bg-brass/10 text-brass-ink mb-3">
              <ShieldCheck className="size-4" />
            </span>
            <p className="stat-figure tnum">{counts.available}</p>
            <p className="text-xs text-taupe mt-1">Available to import</p>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-elevated">
            <span className="flex items-center justify-center size-8 rounded-lg bg-sage/10 text-sage mb-3">
              <Sparkles className="size-4" />
            </span>
            <p className="stat-figure tnum">{counts.imported}</p>
            <p className="text-xs text-taupe mt-1">Already imported</p>
          </div>
          <div className="bg-card rounded-2xl p-5 shadow-elevated flex items-center justify-center">
            <button
              onClick={handleImportAll}
              disabled={importingAll || counts.available === 0}
              className="w-full inline-flex items-center justify-center gap-2 bg-brass text-white text-xs font-semibold px-4 py-3 rounded-xl shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all disabled:opacity-40"
            >
              <Download className="size-3.5" />
              {importingAll ? "Importing…" : "Import all"}
            </button>
          </div>
        </section>
      )}

      {/* ── No CRM account linked ────────────────────────────────────────── */}
      {!loading && !technicianFound && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-2xl bg-card/50 py-10 text-center mb-6">
          <p className="eyebrow mb-3">No CRM account linked</p>
          <p className="font-serif text-2xl mb-3">Account not found in Client CRM.</p>
          <p className="text-sm text-taupe max-w-[48ch] mx-auto leading-relaxed">
            Your Growth Studio login email doesn't match any technician in the Client CRM. Ask your
            admin to ensure both accounts share the same email address.
          </p>
        </div>
      )}

      {/* ── Bookings table ───────────────────────────────────────────────── */}
      {technicianFound && (
        <div className="bg-card rounded-2xl shadow-elevated overflow-hidden">
          {/* Toolbar */}
          <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-4">
            {/* Filter tabs */}
            <div className="flex items-center gap-1 bg-muted rounded-full p-1">
              {(["all", "available", "imported"] as FilterTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    "px-4 py-1.5 text-[10px] font-bold uppercase tracking-[0.15em] rounded-full transition-colors flex items-center gap-1.5 " +
                    (tab === t
                      ? "bg-card text-foreground shadow-elevated"
                      : "text-taupe hover:text-foreground")
                  }
                >
                  {t === "all" ? "All" : t === "available" ? "Available" : "Imported"}
                  <span className="tabular-nums opacity-70">{counts[t]}</span>
                </button>
              ))}
            </div>
            {!loading && (
              <button
                onClick={() => fetchBookings(offset)}
                className="text-[10px] font-semibold uppercase tracking-widest text-taupe hover:text-brass-ink transition-colors flex items-center gap-1.5"
              >
                <RefreshCw className="size-3" />
                Refresh
              </button>
            )}
          </div>

          {/* States */}
          {loading ? (
            <div className="px-6 py-10 text-center text-sm text-taupe italic">
              Loading CRM bookings…
            </div>
          ) : error ? (
            <div className="m-6 flex flex-col items-center justify-center border-2 border-dashed border-destructive/30 bg-destructive/5 rounded-xl py-10 text-center">
              <p className="text-xs font-medium text-destructive mb-1">Error loading bookings</p>
              <p className="text-sm text-taupe">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border rounded-xl m-6 py-10 text-center bg-muted/20">
              <p className="eyebrow mb-2">No bookings</p>
              <p className="text-sm text-taupe">
                {tab === "imported"
                  ? "No bookings have been imported yet."
                  : "All bookings with marketing consent have been imported."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" style={{ minWidth: "680px" }}>
                <thead className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground border-b border-border">
                  <tr>
                    <th className="px-6 py-3 w-8"></th>
                    <th className="px-6 py-3">Client · Service</th>
                    <th className="px-6 py-3 w-[160px]">Date · Category</th>
                    <th className="px-6 py-3 w-[180px]">Consent</th>
                    <th className="px-6 py-3 w-[160px] text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filtered.map((b) => (
                    <BookingRow
                      key={b.id}
                      booking={b}
                      expanded={expandedId === b.id}
                      onToggleExpand={() => setExpandedId(expandedId === b.id ? null : b.id)}
                      importing={importingId === b.id}
                      onImport={() => handleImport(b.id)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && !loading && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-border">
              <button
                onClick={() => fetchBookings(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2 rounded-full hover:bg-muted active:scale-[0.97] transition-all disabled:opacity-30"
              >
                <ArrowLeft className="size-3" />
                Previous
              </button>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-taupe tnum">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                onClick={() => fetchBookings(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2 rounded-full hover:bg-muted active:scale-[0.97] transition-all disabled:opacity-30"
              >
                Next
                <ArrowRight className="size-3" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function BookingRow({
  booking,
  expanded,
  onToggleExpand,
  importing,
  onImport,
}: {
  booking: CrmBooking;
  expanded: boolean;
  onToggleExpand: () => void;
  importing: boolean;
  onImport: () => void;
}) {
  const date = booking.confirmedStartTime
    ? new Date(booking.confirmedStartTime).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Date TBC";

  const consentKeys = booking.recipientConsentData
    ? Object.entries(booking.recipientConsentData).filter(([, v]) => v)
    : [];

  return (
    <>
      <tr className="hover:bg-muted/40 transition-colors">
        {/* Status dot */}
        <td className="px-6 py-4">
          <span
            className={
              "size-2.5 rounded-full block shrink-0 " +
              (booking.imported ? "bg-sage" : "bg-brass")
            }
          />
        </td>

        {/* Client · Service */}
        <td className="px-6 py-4">
          <p className="font-serif text-base leading-tight mb-0.5">
            {booking.recipientName ?? "Unknown client"}
          </p>
          <p className="text-xs text-taupe truncate max-w-[24ch]">{booking.serviceName ?? "—"}</p>
          {booking.recipientEmail && (
            <p className="text-[10px] text-taupe/70 mt-0.5 truncate max-w-[24ch]">
              {booking.recipientEmail}
            </p>
          )}
        </td>

        {/* Date · Category */}
        <td className="px-6 py-4">
          <p className="text-xs text-foreground">{date}</p>
          <p className="text-[10px] uppercase tracking-widest text-taupe mt-0.5">
            {booking.category ?? "General"}
          </p>
        </td>

        {/* Consent */}
        <td className="px-6 py-4">
          <span
            className={
              "inline-block text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full mb-1.5 " +
              (booking.marketingImageConsent ? "bg-sage/10 text-sage" : "bg-muted text-taupe")
            }
          >
            {booking.marketingImageConsent ? "Consent granted" : "No consent"}
          </span>
          {consentKeys.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="block text-[10px] font-semibold uppercase tracking-widest text-taupe hover:text-brass-ink transition-colors mt-0.5"
            >
              {expanded ? "Hide details ↑" : `${consentKeys.length} permissions ↓`}
            </button>
          )}
        </td>

        {/* Action */}
        <td className="px-6 py-4 text-right">
          {booking.imported ? (
            <div className="flex items-center justify-end gap-3">
              <span className="inline-block text-[10px] font-bold uppercase tracking-wide bg-sage/10 text-sage px-2.5 py-1 rounded-full">
                Imported
              </span>
              {booking.appointmentId && (
                <Link
                  to="/appointments"
                  className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-semibold text-foreground px-3.5 py-2 rounded-lg hover:bg-muted active:scale-[0.97] transition-all"
                >
                  View
                </Link>
              )}
            </div>
          ) : (
            <button
              onClick={onImport}
              disabled={importing || (!!booking.confirmedStartTime && new Date(booking.confirmedStartTime) > new Date())}
              title={booking.confirmedStartTime && new Date(booking.confirmedStartTime) > new Date() ? "Cannot import upcoming booking" : undefined}
              className="inline-flex items-center gap-1.5 bg-brass text-white text-xs font-semibold px-3.5 py-2 rounded-lg shadow-elevated hover:brightness-105 hover:shadow-elevated-lg active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {importing ? (
                <>
                  <svg className="animate-spin size-3" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                    />
                  </svg>
                  Importing…
                </>
              ) : (
                <>
                  <Download className="size-3" />
                  Import
                </>
              )}
            </button>
          )}
        </td>
      </tr>

      {/* Expanded detail row */}
      {expanded && (
        <tr className="bg-muted/30">
          <td />
          <td colSpan={4} className="px-6 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Consent permissions */}
              <div className="bg-card rounded-xl shadow-elevated overflow-hidden">
                <div className="px-4 py-3 border-b border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Consent permissions
                  </p>
                </div>
                <div className="divide-y divide-border">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-taupe">Marketing image use</span>
                    <span
                      className={
                        "text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full " +
                        (booking.marketingImageConsent
                          ? "bg-sage/10 text-sage"
                          : "bg-muted text-taupe")
                      }
                    >
                      {booking.marketingImageConsent ? "Allowed" : "Denied"}
                    </span>
                  </div>
                  {consentKeys.map(([key, val]) => (
                    <div key={key} className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-taupe capitalize">
                        {key
                          .replace(/_/g, " ")
                          .replace(/([A-Z])/g, " $1")
                          .trim()}
                      </span>
                      <span
                        className={
                          "text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full " +
                          (val ? "bg-sage/10 text-sage" : "bg-muted text-taupe")
                        }
                      >
                        {val ? "Allowed" : "Denied"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw consent data */}
              {booking.recipientConsentData && (
                <div className="bg-card rounded-xl shadow-elevated overflow-hidden">
                  <div className="px-4 py-3 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Consent data
                    </p>
                  </div>
                  <pre className="px-4 py-3 text-[11px] text-taupe leading-relaxed whitespace-pre-wrap break-words font-mono overflow-auto max-h-40 bg-muted/20">
                    {JSON.stringify(booking.recipientConsentData, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
