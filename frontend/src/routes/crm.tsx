import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";

export const Route = createFileRoute("/crm")({
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
      toast.success(
        `${imported} imported · ${skipped} already done · ${failed} failed`
      );
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
      <header className="mt-6 lg:mt-10 mb-10 max-w-[68ch]">
        <p className="eyebrow mb-5">CRM Integration</p>
        <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl leading-[1.05] tracking-tight">
          Bookings from your <span className="italic">Client CRM</span>.
        </h1>
        <p className="mt-6 text-base sm:text-lg text-taupe leading-relaxed">
          Browse bookings with consent, import them into Growth Studio, and turn
          each session into content — without re-entering data.
        </p>
      </header>

      {/* Status bar */}
      {!loading && !error && (
        <section className="artifact p-6 mb-10 grid grid-cols-2 sm:grid-cols-4 gap-6">
          <Stat label="Total CRM bookings" value={total} />
          <Stat label="Available to import" value={counts.available} accent />
          <Stat label="Already imported" value={counts.imported} />
          <div className="flex items-center sm:justify-end col-span-2 sm:col-span-1">
            <button
              onClick={handleImportAll}
              disabled={importingAll || counts.available === 0}
              className="w-full sm:w-auto bg-foreground text-offwhite px-5 py-2.5 text-[11px] uppercase tracking-[0.22em] hover:bg-taupe transition-colors disabled:opacity-40"
            >
              {importingAll ? "Importing…" : "Import all"}
            </button>
          </div>
        </section>
      )}

      {/* No technician match */}
      {!loading && !technicianFound && (
        <div className="artifact p-10 text-center mb-10">
          <p className="eyebrow mb-3">No CRM account linked</p>
          <p className="font-serif text-2xl mb-3">Account not found in Client CRM.</p>
          <p className="text-sm text-taupe max-w-[48ch] mx-auto">
            Your Growth Studio login email doesn't match any technician in the Client
            CRM. Ask your admin to ensure both accounts share the same email address.
          </p>
        </div>
      )}

      {/* Filter tabs */}
      {technicianFound && (
        <>
          <div className="flex items-baseline gap-1 border-b hairline mb-8">
            {(["all", "available", "imported"] as FilterTab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={
                  "text-[11px] uppercase tracking-[0.2em] px-3 pb-2 -mb-px transition-colors flex items-center gap-2 " +
                  (tab === t
                    ? "text-foreground border-b border-foreground"
                    : "text-taupe hover:text-foreground")
                }
              >
                <span>{t === "all" ? "All" : t === "available" ? "Available" : "Imported"}</span>
                <span className="tabular-nums text-[10px] text-taupe">{counts[t]}</span>
              </button>
            ))}
            {!loading && (
              <button
                onClick={() => fetchBookings(offset)}
                className="ml-auto text-[10px] uppercase tracking-widest text-taupe hover:text-foreground pb-2"
              >
                Refresh
              </button>
            )}
          </div>

          {/* Booking list */}
          {loading ? (
            <div className="artifact p-12 text-center text-taupe italic">
              Loading CRM bookings…
            </div>
          ) : error ? (
            <div className="artifact p-10 text-center">
              <p className="text-[11px] uppercase tracking-widest border-l-2 border-destructive pl-3 text-destructive mb-2">
                {error}
              </p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="artifact p-10 text-center">
              <p className="eyebrow mb-3">No bookings</p>
              <p className="text-sm text-taupe">
                {tab === "imported"
                  ? "No bookings have been imported yet."
                  : "All bookings with marketing consent have been imported."}
              </p>
            </div>
          ) : (
            <div className="space-y-px bg-border">
              {filtered.map((b) => (
                <BookingRow
                  key={b.id}
                  booking={b}
                  expanded={expandedId === b.id}
                  onToggleExpand={() =>
                    setExpandedId(expandedId === b.id ? null : b.id)
                  }
                  importing={importingId === b.id}
                  onImport={() => handleImport(b.id)}
                />
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between mt-8">
              <button
                onClick={() => fetchBookings(Math.max(0, offset - PAGE_SIZE))}
                disabled={offset === 0 || loading}
                className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card disabled:opacity-30"
              >
                ← Previous
              </button>
              <span className="text-[10px] uppercase tracking-widest text-taupe">
                {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </span>
              <button
                onClick={() => fetchBookings(offset + PAGE_SIZE)}
                disabled={offset + PAGE_SIZE >= total || loading}
                className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card disabled:opacity-30"
              >
                Next →
              </button>
            </div>
          )}
        </>
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
    <div className="bg-card">
      {/* Main row */}
      <div className="p-5 sm:p-6 grid grid-cols-1 sm:grid-cols-12 gap-5 items-center">
        {/* Status dot */}
        <div className="sm:col-span-1 flex items-center">
          <span
            className={
              "size-2.5 rounded-full flex-shrink-0 " +
              (booking.imported ? "bg-sage" : "bg-foreground")
            }
          />
        </div>

        {/* Client + service */}
        <div className="sm:col-span-4 min-w-0">
          <p className="eyebrow mb-1">
            {date} · {booking.category ?? "General"}
          </p>
          <p className="font-serif text-xl mb-0.5">
            {booking.recipientName ?? "Unknown client"}
          </p>
          <p className="text-xs text-taupe truncate">
            {booking.serviceName ?? "—"}
          </p>
        </div>

        {/* Consent summary */}
        <div className="sm:col-span-3">
          <p
            className={
              "text-[10px] uppercase tracking-widest mb-1 " +
              (booking.marketingImageConsent ? "text-sage" : "text-taupe")
            }
          >
            {booking.marketingImageConsent
              ? "Marketing consent ✓"
              : "No marketing consent"}
          </p>
          {booking.recipientEmail && (
            <p className="text-xs text-taupe truncate">{booking.recipientEmail}</p>
          )}
        </div>

        {/* Actions */}
        <div className="sm:col-span-4 flex flex-wrap items-center gap-3 sm:justify-end">
          {consentKeys.length > 0 && (
            <button
              onClick={onToggleExpand}
              className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
            >
              {expanded ? "Hide details ↑" : "See details ↓"}
            </button>
          )}

          {booking.imported ? (
            <div className="flex items-center gap-3">
              <span className="text-[10px] uppercase tracking-widest text-sage">
                Imported
              </span>
              {booking.appointmentId && (
                <Link
                  to="/appointments"
                  className="text-[11px] uppercase tracking-[0.2em] border hairline px-4 py-2 hover:bg-card"
                >
                  View →
                </Link>
              )}
            </div>
          ) : (
            <button
              onClick={onImport}
              disabled={importing}
              className="text-[11px] uppercase tracking-[0.2em] bg-foreground text-offwhite px-4 py-2 hover:bg-taupe transition-colors disabled:opacity-50"
            >
              {importing ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>

      {/* Expanded: consent + questionnaire data */}
      {expanded && (
        <div className="px-5 sm:px-6 pb-6 pt-0 border-t hairline grid grid-cols-1 sm:grid-cols-2 gap-6">
          {/* Consent breakdown */}
          <div>
            <p className="text-[10px] uppercase tracking-widest text-taupe mb-3 mt-4">
              Consent permissions
            </p>
            <div className="space-y-1.5">
              <ConsentLine
                label="Marketing image use"
                allowed={booking.marketingImageConsent}
              />
              {consentKeys.map(([key, val]) => (
                <ConsentLine
                  key={key}
                  label={key
                    .replace(/_/g, " ")
                    .replace(/([A-Z])/g, " $1")
                    .trim()}
                  allowed={!!val}
                />
              ))}
            </div>
          </div>

          {/* Raw intake / notes */}
          {booking.recipientConsentData && (
            <div>
              <p className="text-[10px] uppercase tracking-widest text-taupe mb-3 mt-4">
                Consent data
              </p>
              <pre className="text-[11px] text-taupe leading-relaxed whitespace-pre-wrap break-words font-mono bg-card/60 p-3 border hairline">
                {JSON.stringify(booking.recipientConsentData, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ConsentLine({ label, allowed }: { label: string; allowed: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span
        className={
          "text-[10px] " + (allowed ? "text-sage" : "text-taupe")
        }
      >
        {allowed ? "✓" : "✗"}
      </span>
      <span className="text-[11px] text-taupe capitalize">{label}</span>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: boolean;
}) {
  return (
    <div>
      <p
        className={
          "font-serif text-3xl mb-1 " +
          (accent ? "text-foreground" : "text-taupe")
        }
      >
        {value}
      </p>
      <p className="text-[10px] uppercase tracking-widest text-taupe">{label}</p>
    </div>
  );
}
