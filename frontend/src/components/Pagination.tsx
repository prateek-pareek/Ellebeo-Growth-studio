function getPageList(current: number, total: number): (number | "…")[] {
  const delta = 1;
  const left = Math.max(2, current - delta);
  const right = Math.min(total - 1, current + delta);
  const range: (number | "…")[] = [1];
  if (left > 2) range.push("…");
  for (let i = left; i <= right; i++) range.push(i);
  if (right < total - 1) range.push("…");
  if (total > 1) range.push(total);
  return range;
}

export function Pagination({
  page, totalPages, total, pageSize, onChange,
}: {
  page: number; totalPages: number; total: number; pageSize: number; onChange: (page: number) => void;
}) {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = getPageList(page, totalPages);

  return (
    <div className="flex items-center justify-between gap-4 flex-wrap pt-6 mt-6 border-t border-border">
      <p className="text-[10px] uppercase tracking-widest text-taupe tabular-nums">
        Showing {start}–{end} of {total}
      </p>
      <div className="flex items-center gap-1">
        <button
          onClick={() => onChange(page - 1)}
          disabled={page === 1}
          className="size-7 flex items-center justify-center border border-border text-taupe text-xs hover:text-foreground hover:border-foreground/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Previous page"
        >
          ‹
        </button>
        {pages.map((p, i) =>
          p === "…" ? (
            <span key={`ellipsis-${i}`} className="w-7 text-center text-[10px] text-taupe/60">…</span>
          ) : (
            <button
              key={p}
              onClick={() => onChange(p)}
              className={
                "size-7 flex items-center justify-center text-[11px] tabular-nums border transition-colors " +
                (p === page
                  ? "bg-foreground text-offwhite border-foreground"
                  : "border-border text-taupe hover:text-foreground hover:border-foreground/50")
              }
            >
              {p}
            </button>
          )
        )}
        <button
          onClick={() => onChange(page + 1)}
          disabled={page === totalPages}
          className="size-7 flex items-center justify-center border border-border text-taupe text-xs hover:text-foreground hover:border-foreground/50 disabled:opacity-30 disabled:pointer-events-none transition-colors"
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
}
