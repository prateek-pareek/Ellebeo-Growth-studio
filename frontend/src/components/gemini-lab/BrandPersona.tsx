import { useState } from "react";
import { Loader2, Sparkles, Globe, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { MOOD_META, OBJECTIVE_META, type GuidedDnaProfile } from "@/lib/gemini-lab-dna/contract";
import { adjustBrand, scanWebsite } from "@/lib/gemini-lab-dna/api";

/**
 * The brand as a person, not a form.
 *
 * The wizard collects around forty values across five steps. Nobody describes
 * their own studio that way — they say "we're warmer than that", or they point
 * at their website and say "it's all there". So this shows the brand back as a
 * short written character, set in the studio's own colours and type, and takes
 * changes the same way it takes description: in a sentence.
 *
 * The long form still exists behind "Edit every field" for the cases where
 * someone genuinely wants to set one value precisely. It is no longer the way
 * in.
 */

export function BrandPersona({
  draft,
  onChange,
  onOpenFullEditor,
}: {
  draft: GuidedDnaProfile;
  onChange: (next: GuidedDnaProfile) => void;
  onOpenFullEditor: () => void;
}) {
  const [wish, setWish] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState<"adjust" | "scan" | null>(null);
  const [lastChanged, setLastChanged] = useState<string[]>([]);
  const [previous, setPrevious] = useState<GuidedDnaProfile | null>(null);

  const id = draft.identity;
  const mood = MOOD_META[id.mood];
  const objective = OBJECTIVE_META[draft.strategy.objective];
  const headingFont = `"${id.typography.heading}", Georgia, serif`;
  const bodyFont = `"${id.typography.body}", system-ui, sans-serif`;

  async function applyWish() {
    const text = wish.trim();
    if (!text) return;
    setBusy("adjust");
    try {
      const res = await adjustBrand(draft, text);
      setPrevious(draft);
      setLastChanged(res.changed ?? []);
      onChange(res.draft);
      setWish("");
      toast.success(res.changed?.length ? `Updated ${res.changed.join(", ")}.` : "Updated.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Could not make that change.");
    } finally {
      setBusy(null);
    }
  }

  async function fillFromWebsite() {
    const text = url.trim();
    if (!text) return;
    setBusy("scan");
    try {
      const s = await scanWebsite(text);
      setPrevious(draft);
      setLastChanged(["everything, from your website"]);
      onChange({
        ...draft,
        identity: { ...draft.identity, brandName: s.brandName || draft.identity.brandName, mood: s.mood, essence: s.essence as any },
        offering: {
          ...draft.offering,
          serviceCategory: s.serviceCategory || draft.offering.serviceCategory,
          services: s.services?.length ? s.services : draft.offering.services,
        },
        audience: {
          ...draft.audience,
          ageMin: s.ageMin ?? draft.audience.ageMin,
          ageMax: s.ageMax ?? draft.audience.ageMax,
          genderFocus: (s.genderFocus as any) ?? draft.audience.genderFocus,
          clientTypes: s.clientTypes?.length ? s.clientTypes : draft.audience.clientTypes,
        },
        strategy: { ...draft.strategy, objective: (s.objective as any) ?? draft.strategy.objective },
        story: { ...draft.story, aiDrafted: s.storySentence || draft.story.aiDrafted },
      });
      setUrl("");
      toast.success("Filled in from your website. Read it and adjust anything that's off.");
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || "Could not read that page.");
    } finally {
      setBusy(null);
    }
  }

  const story = draft.story.userWritten || draft.story.aiDrafted || mood.blurb;
  const serves = draft.audience.clientTypes.length
    ? draft.audience.clientTypes.join(", ")
    : "clients";

  return (
    <div className="space-y-4">
      {/* The persona itself, set in the studio's own colours and faces so the
          identity is shown rather than described. */}
      {/* The persona.
          The first version set the name, the story, the mood, the audience and
          the objective at almost the same size and weight, so five different
          kinds of fact arrived as one grey paragraph. A person reads this to
          answer "is this us?", which needs the name and the sentence to carry
          and the rest to sit quietly underneath, labelled. */}
      <div className="rounded-[8px] border border-border overflow-hidden shadow-elevated">
        {/* Equal swatches with hairlines between, so a pale ground colour is
            still visibly a swatch rather than blending into the card. */}
        {/* Outlined, not just divided. The first swatch is usually the brand's
            paper, which is the same colour as the card beneath it — without a
            border the strip appeared to start a third of the way across. */}
        <div className="grid grid-cols-4 border-b border-black/10">
          {id.palette.map((hex, i) => (
            <span
              key={hex + i}
              className="block h-14 border-r last:border-r-0 border-black/10"
              style={{ background: hex }}
              title={hex}
            />
          ))}
        </div>

        <div className="p-7 sm:p-9" style={{ background: id.palette[0] }}>
          <p
            className="text-[34px] leading-[1.05] tracking-[-0.01em]"
            style={{ fontFamily: headingFont, color: id.palette[2] }}
          >
            {id.brandName || "Your studio"}
          </p>

          <p
            className="mt-3 text-[17px] leading-relaxed max-w-[46ch]"
            style={{ fontFamily: bodyFont, color: id.palette[2] }}
          >
            {story}
          </p>

          {/* The facts, labelled. Each answers a different question, so each
              gets its own row rather than another sentence in the same voice. */}
          <dl
            className="mt-7 grid gap-x-10 gap-y-4 sm:grid-cols-2 max-w-[42rem]"
            style={{ fontFamily: bodyFont, color: id.palette[2] }}
          >
            <Fact label="Feels like" value={`${mood.label} · ${id.essence.join(", ").toLowerCase() || "not set"}`} />
            <Fact label="For" value={`${serves}, ${draft.audience.ageMin}–${draft.audience.ageMax}`} />
            <Fact
              label="Does"
              value={
                draft.offering.services.length
                  ? draft.offering.services.join(", ")
                  : draft.offering.serviceCategory || "not set"
              }
            />
            <Fact
              label="Posting to"
              value={objective?.label ?? "grow"}
              hint={draft.offering.serviceAreas.length ? draft.offering.serviceAreas.join(", ") : undefined}
            />
          </dl>
        </div>
      </div>

      {lastChanged.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
            Just changed: {lastChanged.join(", ")}
          </p>
          {previous && (
            <button
              type="button"
              onClick={() => {
                onChange(previous);
                setPrevious(null);
                setLastChanged([]);
              }}
              className="inline-flex items-center gap-1.5 text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink transition-colors"
            >
              <Undo2 className="size-3" /> Undo that
            </button>
          )}
        </div>
      )}

      {/* Change it by saying what is wrong with it. */}
      <div className="rounded-[8px] border border-pale-stone bg-soft-linen/60 p-4 space-y-2.5">
        <label className="text-[18px] tracking-[0.01em] text-ink flex items-center gap-1.5">
          <Sparkles className="size-3.5" />
          Not quite you? Say what's off
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            value={wish}
            onChange={(e) => setWish(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void applyWish();
            }}
            placeholder="e.g. we're more clinical than that · we mostly do bridal · speak to men too"
            className="field flex-1 min-w-[260px] tracking-[0.01em]"
          />
          <button type="button" onClick={applyWish} disabled={busy !== null || !wish.trim()} className="btn btn-primary">
            {busy === "adjust" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            Change it
          </button>
        </div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
          Written however you'd say it out loud. Only what you mention changes.
        </p>
      </div>

      {/* Or start from something that already exists. */}
      <div className="rounded-[8px] border border-pale-stone bg-card p-4 space-y-2.5">
        <label className="text-[18px] tracking-[0.01em] text-ink flex items-center gap-1.5">
          <Globe className="size-3.5" />
          Or fill it in from your website
        </label>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void fillFromWebsite();
            }}
            placeholder="yourstudio.com.au"
            className="field flex-1 min-w-[240px] tracking-[0.01em]"
          />
          <button type="button" onClick={fillFromWebsite} disabled={busy !== null || !url.trim()} className="btn btn-ghost">
            {busy === "scan" ? <Loader2 className="size-4 animate-spin" /> : <Globe className="size-4" />}
            Read my site
          </button>
        </div>
        <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
          Reads the page and fills in your name, mood, services, who you serve and your story. Nothing is published.
        </p>
      </div>

      <button
        type="button"
        onClick={onOpenFullEditor}
        className="text-[14px] tracking-[0.01em] text-graphite-warm hover:text-ink underline underline-offset-4 transition-colors"
      >
        Edit every field instead
      </button>
    </div>
  );
}

/** One labelled fact on the persona card. */
function Fact({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      {/* 0.5 on a light ground left these barely visible. A label should be
          quiet, not faint. */}
      <dt className="text-[12px] uppercase tracking-[0.14em]" style={{ opacity: 0.68 }}>
        {label}
      </dt>
      <dd className="mt-1 text-[16px] leading-snug">
        {value}
        {hint ? <span style={{ opacity: 0.7 }}> · {hint}</span> : null}
      </dd>
    </div>
  );
}
