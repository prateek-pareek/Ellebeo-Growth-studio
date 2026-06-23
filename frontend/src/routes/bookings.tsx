import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/bookings")({
  head: () => ({
    meta: [
      { title: "CRM Bookings — Elle.Be.O Growth" },
      { name: "description", content: "Browse and import bookings from your Client CRM into Growth Studio." },
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
  const [tab, setTab]                     = useState<FilterTab>("all");
  const [bookings, setBookings]           = useState<CrmBooking[]>([]);
  const [total, setTotal]                 = useState(0);
  const [technicianFound, setTechnicianFound] = useState(true);
  const [loading, setLoading]             = useState(true);
  const [error, setError]                 = useState<string | null>(null);
  const [offset, setOffset]               = useState(0);
  const [importingId, setImportingId]     = useState<string | null>(null);
  const [importingAll, setImportingAll]   = useState(false);
  const [expandedId, setExpandedId]       = useState<string | null>(null);

  const fetchBookings = useCallback(async (off = 0) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<{ data: ListResponse }>(
        `/crm/bookings?limit=${PAGE_SIZE}&offset=${off}`
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

  useEffect(() => { fetchBookings(0); }, [fetchBookings]);

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
      const skipped  = results.filter((r) => r.status === "already_imported").length;
      const failed   = results.filter((r) => r.status === "failed").length;
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
    if (tab === "imported")  return b.imported;
    return true;
  });

  const counts = {
    all:       bookings.length,
    available: bookings.filter((b) => !b.imported).length,
    imported:  bookings.filter((b) => b.imported).length,
  };

  return (
    <div>
      {/* ── Page header ──────────────────────────────────────────────────── */}
      <header className="mt-6 lg:mt-10 mb-8">
        <div className="flex items-center gap-2.5 mb-4">
          <span className="text-[9px] font-bold uppercase tracking-[0.3em] text-taupe">Bookings</span>
          <span className="text-taupe/30">·</span>
          <span className="inline-flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-widest text-sage bg-sage/10 border border-sage/25 px-2.5 py-1 rounded-full">
            <span className="size-1.5 rounded-full bg-sage animate-pulse" />
            Live
          </span>
        </div>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight max-w-[22ch]">
          Bookings from your <span className="italic text-taupe">Client CRM</span>.
        </h1>
        <p className="mt-4 text-sm text-taupe leading-relaxed max-w-[52ch]">
          Browse bookings, import them into Growth Studio, and turn each session into content.
        </p>
      </header>

      {/* ── Stats + import all ───────────────────────────────────────────── */}
      {!loading && !error && (
        <section className="border border-border bg-card shadow-sm overflow-hidden mb-10">
          <div className="bg-muted px-5 py-3 border-b border-border">
            <h2 className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
              Overview
            </h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border">
            <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                Total CRM bookings
              </p>
              <p className="mt-2 font-serif text-4xl tabular-nums">{total}</p>
            </div>
            <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                Available to import
              </p>
              <p className="mt-2 font-serif text-4xl tabular-nums text-foreground">{counts.available}</p>
            </div>
            <div className="px-6 py-5 group hover:bg-nude/20 transition-colors cursor-default">
              <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-muted-foreground group-hover:text-taupe transition-colors">
                Already imported
              </p>
              <p className="mt-2 font-serif text-4xl tabular-nums text-sage">{counts.imported}</p>
            </div>
            <div className="px-6 py-5 flex items-center justify-start sm:justify-end">
              <button
                onClick={handleImportAll}
                disabled={importingAll || counts.available === 0}
                className="inline-flex items-center gap-2 bg-foreground text-offwhite text-xs font-medium px-4 py-2.5 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-40"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                </svg>
                {importingAll ? "Importing…" : "Import all"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ── No CRM account linked ────────────────────────────────────────── */}
      {!loading && !technicianFound && (
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-border bg-card/50 py-14 text-center mb-10">
          <p className="eyebrow mb-3">No CRM account linked</p>
          <p className="font-serif text-2xl mb-3">Account not found in Client CRM.</p>
          <p className="text-sm text-taupe max-w-[48ch] mx-auto leading-relaxed">
            Your Growth Studio login email doesn't match any technician in the Client
            CRM. Ask your admin to ensure both accounts share the same email address.
          </p>
        </div>
      )}

      {/* ── Bookings table ───────────────────────────────────────────────── */}
      {technicianFound && (
        <div className="border border-border bg-card shadow-sm overflow-hidden">
          {/* Toolbar */}
          <div className="bg-muted px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-3">
            {/* Filter tabs */}
            <div className="flex items-center divide-x divide-border border border-border">
              {(["all", "available", "imported"] as FilterTab[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={
                    "px-3 py-1.5 text-[10px] uppercase tracking-[0.2em] transition-colors flex items-center gap-2 " +
                    (tab === t
                      ? "bg-foreground text-offwhite"
                      : "text-taupe hover:text-foreground hover:bg-nude/30")
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
                className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors flex items-center gap-1.5"
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 11-2.12-9.36L23 10"/>
                </svg>
                Refresh
              </button>
            )}
          </div>

          {/* States */}
          {loading ? (
            <div className="px-5 py-14 text-center text-sm text-taupe italic">
              Loading CRM bookings…
            </div>
          ) : error ? (
            <div className="m-6 flex flex-col items-center justify-center border-2 border-dashed border-destructive/30 bg-destructive/5 py-10 text-center">
              <p className="text-xs font-medium text-destructive mb-1">Error loading bookings</p>
              <p className="text-sm text-taupe">{error}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-border m-6 py-12 text-center bg-muted/20">
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
                <thead className="bg-muted border-b border-border text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                  <tr>
                    <th className="px-5 py-3 w-8"></th>
                    <th className="px-5 py-3">Client · Service</th>
                    <th className="px-5 py-3 w-[160px]">Date · Category</th>
                    <th className="px-5 py-3 w-[180px]">Consent</th>
                    <th className="px-5 py-3 w-[160px] text-right">Action</th>
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
            <div className="flex items-center justify-between px-5 py-4 border-t border-border bg-muted/40">
              <button
                onClick={() => fetchBookings(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-30"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
                Previous
              </button>
              <span className="text-[10px] uppercase tracking-widest text-taupe">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                onClick={() => fetchBookings(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-30"
              >
                Next
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
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
        day: "numeric", month: "short", year: "numeric",
      })
    : "Date TBC";

  const consentKeys = booking.recipientConsentData
    ? Object.entries(booking.recipientConsentData).filter(([, v]) => v)
    : [];

  return (
    <>
      <tr className="hover:bg-nude/20 transition-colors">
        {/* Status dot */}
        <td className="px-5 py-4">
          <span className={
            "size-2.5 rounded-full block shrink-0 " +
            (booking.imported ? "bg-sage" : "bg-foreground")
          } />
        </td>

        {/* Client · Service */}
        <td className="px-5 py-4">
          <p className="font-serif text-base leading-tight mb-0.5">
            {booking.recipientName ?? "Unknown client"}
          </p>
          <p className="text-xs text-taupe truncate max-w-[24ch]">
            {booking.serviceName ?? "—"}
          </p>
          {booking.recipientEmail && (
            <p className="text-[10px] text-taupe/70 mt-0.5 truncate max-w-[24ch]">
              {booking.recipientEmail}
            </p>
          )}
        </td>

        {/* Date · Category */}
        <td className="px-5 py-4">
          <p className="text-xs text-foreground">{date}</p>
          <p className="text-[10px] uppercase tracking-widest text-taupe mt-0.5">
            {booking.category ?? "General"}
          </p>
        </td>

        {/* Consent */}
        <td className="px-5 py-4">
          <span className={
            "inline-block text-[10px] uppercase tracking-widest px-2 py-0.5 mb-1 " +
            (booking.marketingImageConsent
              ? "text-sage bg-sage/10"
              : "text-taupe bg-taupe/10")
          }>
            {booking.marketingImageConsent ? "Consent granted" : "No consent"}
          </span>
          {consentKeys.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="block text-[10px] uppercase tracking-widest text-taupe hover:text-foreground transition-colors mt-0.5"
            >
              {expanded ? "Hide details ↑" : `${consentKeys.length} permissions ↓`}
            </button>
          )}
        </td>

        {/* Action */}
        <td className="px-5 py-4 text-right">
          {booking.imported ? (
            <div className="flex items-center justify-end gap-3">
              <span className="inline-block text-[10px] uppercase tracking-widest text-sage bg-sage/10 px-2 py-0.5">
                Imported
              </span>
              {booking.appointmentId && (
                <Link
                  to="/appointments"
                  className="inline-flex items-center gap-1.5 border border-border bg-card text-xs font-medium text-foreground px-3.5 py-2 shadow-sm hover:bg-muted hover:shadow-md active:scale-[0.97] transition-all"
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
              className="inline-flex items-center gap-1.5 bg-foreground text-offwhite text-xs font-medium px-3.5 py-2 shadow-sm hover:opacity-90 hover:shadow-md active:scale-[0.97] transition-all disabled:opacity-50"
            >
              {importing ? (
                <>
                  <svg className="animate-spin size-3" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                  Importing…
                </>
              ) : (
                <>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
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
          <td colSpan={4} className="px-5 py-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {/* Consent permissions */}
              <div className="border border-border bg-card shadow-sm overflow-hidden">
                <div className="bg-muted px-4 py-2 border-b border-border">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                    Consent permissions
                  </p>
                </div>
                <div className="divide-y divide-border">
                  <div className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-xs text-taupe">Marketing image use</span>
                    <span className={
                      "text-[10px] uppercase tracking-widest px-2 py-0.5 " +
                      (booking.marketingImageConsent ? "text-sage bg-sage/10" : "text-taupe bg-taupe/10")
                    }>
                      {booking.marketingImageConsent ? "Allowed" : "Denied"}
                    </span>
                  </div>
                  {consentKeys.map(([key, val]) => (
                    <div key={key} className="px-4 py-2.5 flex items-center justify-between">
                      <span className="text-xs text-taupe capitalize">
                        {key.replace(/_/g, " ").replace(/([A-Z])/g, " $1").trim()}
                      </span>
                      <span className={
                        "text-[10px] uppercase tracking-widest px-2 py-0.5 " +
                        (val ? "text-sage bg-sage/10" : "text-taupe bg-taupe/10")
                      }>
                        {val ? "Allowed" : "Denied"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Raw consent data */}
              {booking.recipientConsentData && (
                <div className="border border-border bg-card shadow-sm overflow-hidden">
                  <div className="bg-muted px-4 py-2 border-b border-border">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">
                      Consent data
                    </p>
                  </div>
                  <pre className="px-4 py-3 text-[11px] text-taupe leading-relaxed whitespace-pre-wrap break-words font-mono overflow-auto max-h-40">
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
