import { useEffect, useState } from "react";
import { Loader2, Sparkles, RotateCcw, Check } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";

/**
 * The instructions the generator follows, made editable.
 *
 * These blocks — who is writing, how to read a photo, the rules for on-image
 * copy and captions, the studio's own house rules — have been editable on the
 * server since they were written. There has never been a screen for them, so
 * in practice nobody could change how their posts sound without a deploy, and
 * "I can't edit the system prompt" was simply true.
 *
 * Each block shows the shipped wording and the studio's override separately,
 * so it is always clear whether you are looking at ours or yours, and a block
 * can be put back with one click.
 */

type Block = {
  id: string;
  label: string;
  help: string;
  maxChars: number;
  default: string;
  override: string | null;
  effective: string;
};

export function PromptEditor() {
  const [blocks, setBlocks] = useState<Block[] | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [improving, setImproving] = useState<string | null>(null);
  const [wishes, setWishes] = useState<Record<string, string>>({});
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get("/gemini-lab/prompt-blocks")
      .then((res) => {
        if (cancelled) return;
        const list: Block[] = res.data?.data?.blocks ?? [];
        setBlocks(list);
        setDrafts(Object.fromEntries(list.map((b) => [b.id, b.override ?? ""])));
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function save() {
    setSaving(true);
    try {
      // Only non-empty overrides are sent: an empty box means "use yours",
      // not "make this block blank".
      const overrides = Object.fromEntries(
        Object.entries(drafts).filter(([, v]) => v.trim().length > 0),
      );
      const res = await api.put("/gemini-lab/prompt-blocks", { overrides });
      const list: Block[] = res.data?.data?.blocks ?? [];
      if (list.length) setBlocks(list);
      toast.success("Saved. New posts will follow these.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Could not save those instructions.");
    } finally {
      setSaving(false);
    }
  }

  async function improve(b: Block) {
    const wish = (wishes[b.id] ?? "").trim();
    if (!wish) return;
    setImproving(b.id);
    try {
      const res = await api.post("/gemini-lab/prompt-blocks/improve", { id: b.id, wish });
      const text: string = res.data?.data?.text ?? "";
      if (!text) {
        toast.error("Nothing came back. Try describing the change differently.");
        return;
      }
      setDrafts((d) => ({ ...d, [b.id]: text }));
      setWishes((w) => ({ ...w, [b.id]: "" }));
      toast.success("Rewritten below — read it, then Save.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Could not rewrite that.");
    } finally {
      setImproving(null);
    }
  }

  if (error) {
    return (
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
        Could not load the generator's instructions.
      </p>
    );
  }
  if (!blocks) {
    return (
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm inline-flex items-center gap-2">
        <Loader2 className="size-3.5 animate-spin" /> Loading…
      </p>
    );
  }

  const changed = blocks.some((b) => (drafts[b.id] ?? "") !== (b.override ?? ""));

  return (
    <div className="space-y-5">
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
        These are the instructions every post is written from. Leave a box empty to use ours;
        write in it to use yours. Guardrails are not here — a rewrite can change how posts sound,
        never whether a price or a client quote can be invented.
      </p>

      {blocks.map((b) => {
        const mine = drafts[b.id] ?? "";
        const usingMine = mine.trim().length > 0;
        return (
          <div key={b.id} className="rounded-[8px] border border-pale-stone bg-card p-4 space-y-2.5">
            <div className="flex items-baseline justify-between gap-3">
              <div>
                <p className="text-[18px] tracking-[0.01em] text-ink">{b.label}</p>
                <p className="text-[14px] tracking-[0.01em] text-graphite-warm">{b.help}</p>
              </div>
              <span className="shrink-0 text-[14px] tracking-[0.01em] text-graphite-warm inline-flex items-center gap-1">
                {usingMine ? <Check className="size-3 text-sage" /> : null}
                {usingMine ? "Yours" : "Ours"}
              </span>
            </div>

            {/* What ships, so it is obvious what you are replacing. */}
            <details>
              <summary className="text-[14px] tracking-[0.01em] text-graphite-warm cursor-pointer">
                Show the wording we ship
              </summary>
              <p className="mt-1.5 whitespace-pre-wrap text-[14px] tracking-[0.01em] text-graphite-warm">
                {b.default || "(nothing — this block is yours to fill)"}
              </p>
            </details>

            <textarea
              value={mine}
              onChange={(e) => setDrafts((d) => ({ ...d, [b.id]: e.target.value.slice(0, b.maxChars) }))}
              rows={4}
              placeholder="Write your own version here, or leave empty to use ours"
              className="field tracking-[0.01em] resize-y"
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-[14px] tracking-[0.01em] text-graphite-warm tabular-nums">
                {mine.length} / {b.maxChars}
              </span>
              {usingMine && (
                <button
                  type="button"
                  onClick={() => setDrafts((d) => ({ ...d, [b.id]: "" }))}
                  className="inline-flex items-center gap-1.5 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
                >
                  <RotateCcw className="size-3" /> Put ours back
                </button>
              )}
            </div>

            {/* Describe the change in your own words and have it written for
                you — the same wording rules, applied by the model. */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <input
                value={wishes[b.id] ?? ""}
                onChange={(e) => setWishes((w) => ({ ...w, [b.id]: e.target.value }))}
                placeholder='e.g. "never say pamper" or "shorter, more direct"'
                className="field flex-1 min-w-[220px] tracking-[0.01em]"
              />
              <button
                type="button"
                onClick={() => improve(b)}
                disabled={improving === b.id || !(wishes[b.id] ?? "").trim()}
                className="btn btn-ghost btn-sm"
              >
                {improving === b.id ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5" />
                )}
                Rewrite it for me
              </button>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-3">
        <button type="button" onClick={save} disabled={saving || !changed} className="btn btn-primary">
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          {saving ? "Saving…" : "Save instructions"}
        </button>
        {!changed && (
          <span className="text-[14px] tracking-[0.01em] text-graphite-warm">Nothing changed yet.</span>
        )}
      </div>
    </div>
  );
}
