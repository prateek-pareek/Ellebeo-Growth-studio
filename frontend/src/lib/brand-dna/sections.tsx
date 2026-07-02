/**
 * Brand DNA — section UIs.
 *
 * One component per visible part of the form. Required fields (marked
 * with *) are limited to the core inputs: professional name, at least
 * one category, the one-sentence essence, image energy, and the primary
 * palette colour. Everything else is optional and improves the quality
 * of what Elle.Be.O generates without ever blocking save.
 */
import { useEffect, useMemo, useState } from "react";
import type {
  BrandDnaRecord,
  SectionId,
  MoodboardRef,
  MoodboardUsage,
  AssetLibraryItem,
  AssetType,
  AssetUsageRule,
  AssetConsentStatus,
} from "./schema";
import { computeCompletion, type Milestone, type MilestoneStatus } from "./completion";

import { useFeatureFlag } from "@/lib/feature-flags";
import { Checkbox } from "@/components/ui/checkbox";
import {
  uploadBrandFile, signOne, signMany,
  queueDeleteOnSave, validateBrandFile,
} from "@/lib/brand-dna/storage";

// ─── primitives ────────────────────────────────────────────────────────

function Label({
  children,
  required,
  hint,
}: {
  children: React.ReactNode;
  required?: boolean;
  hint?: string;
}) {
  return (
    <div className="mb-1.5">
      <label className="text-[11px] uppercase tracking-[0.18em] text-foreground">
        {children}
        {required && <span className="text-foreground/60 ml-1" aria-hidden>*</span>}
      </label>
      {hint && <p className="text-[11px] text-taupe mt-1 leading-relaxed">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full border hairline bg-card px-3 py-2.5 text-sm text-foreground placeholder:text-taupe/60 focus:outline-none focus:border-foreground transition-colors";

function Text({
  label, value, onChange, placeholder, hint, required,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean;
}) {
  return (
    <div>
      <Label required={required} hint={hint}>{label}</Label>
      <input className={inputCls} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

function Area({
  label, value, onChange, placeholder, hint, required, rows = 3,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; hint?: string; required?: boolean; rows?: number;
}) {
  return (
    <div>
      <Label required={required} hint={hint}>{label}</Label>
      <textarea
        className={inputCls + " resize-none"}
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function Select({
  label, value, onChange, options, hint, required, placeholder = "Select…",
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  hint?: string; required?: boolean; placeholder?: string;
}) {
  return (
    <div>
      <Label required={required} hint={hint}>{label}</Label>
      <select className={inputCls} value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{placeholder}</option>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function MultiChip({
  label, values, onChange, options, hint,
}: {
  label: string; values: string[]; onChange: (v: string[]) => void;
  options: string[]; hint?: string;
}) {
  function toggle(opt: string) {
    if (values.includes(opt)) onChange(values.filter((v) => v !== opt));
    else onChange([...values, opt]);
  }
  return (
    <div>
      <Label hint={hint}>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const on = values.includes(opt);
          return (
            <button
              key={opt}
              type="button"
              onClick={() => toggle(opt)}
              className={
                "px-3 py-1.5 text-[11px] tracking-wide border hairline transition-colors " +
                (on ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")
              }
            >
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function Color({
  label, value, onChange, hint, required,
}: {
  label: string; value: string; onChange: (v: string) => void; hint?: string; required?: boolean;
}) {
  const safe = /^#[0-9a-fA-F]{6}$/.test(value) ? value : "#d6cfc4";
  return (
    <div>
      <Label required={required} hint={hint}>{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={safe}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 border hairline bg-card cursor-pointer"
          aria-label={`${label} swatch`}
        />
        <input
          className={inputCls + " font-mono"}
          value={value}
          placeholder="#000000"
          onChange={(e) => onChange(e.target.value)}
        />
      </div>
    </div>
  );
}

function Verbatim({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="border hairline bg-nude/30 p-4">
      <p className="text-[10px] uppercase tracking-widest text-foreground mb-2">{title}</p>
      <ul className="space-y-1.5 text-xs text-foreground leading-relaxed">
        {items.map((i) => <li key={i}>· {i}</li>)}
      </ul>
    </div>
  );
}

// ─── per-section components ────────────────────────────────────────────

type Patch = (partial: Partial<BrandDnaRecord>) => void;
type S = { record: BrandDnaRecord; patch: Patch };

// Regulated detection — driven by the user-facing categories list, the
// stored scalar `category`, and the explicit Medical Aesthetics
// practitioner toggle. Any one of them triggers stricter guardrails.
export const REGULATED_CATEGORIES: ReadonlySet<string> = new Set([
  "skin",
  "skin_therapist",
  "cosmetic_medicine",
  "medical_aesthetics",
  "skin_medical_aesthetics",
  "injector",
  "injectables",
]);

export function isRegulatedRecord(r: BrandDnaRecord): boolean {
  if (r.compliance.medical_aesthetics_practitioner) return true;
  if (REGULATED_CATEGORIES.has(r.foundations.category)) return true;
  return (r.foundations.categories || []).some((c) => REGULATED_CATEGORIES.has(c));
}

const CATEGORY_OPTIONS: Array<{ id: string; label: string }> = [
  { id: "hair",                label: "Hair" },
  { id: "makeup",              label: "Makeup" },
  { id: "nails",               label: "Nails" },
  { id: "eyelashes",           label: "Eyelashes" },
  { id: "medical_aesthetics",  label: "Medical Aesthetics" },
  { id: "skin",                label: "Skin" },
  { id: "eyebrows",            label: "Eyebrows" },
];

const SIGNATURE_PLACEHOLDERS = "e.g. Blonde specialist, tape extensions, editorial makeup, bridal skin prep, brow lamination, lash extensions, skin needling, injectables, glass skin facials";

function S1Foundations({ record, patch }: S) {
  const f = record.foundations;
  const set = (k: keyof typeof f, v: string) => patch({ foundations: { ...f, [k]: v } });

  const selected = f.categories && f.categories.length > 0
    ? f.categories
    : f.category ? [f.category] : [];

  function toggleCategory(id: string) {
    const next = selected.includes(id)
      ? selected.filter((c) => c !== id)
      : [...selected, id];
    patch({ foundations: { ...f, categories: next, category: next[0] ?? "" } });
  }

  return (
    <div className="grid sm:grid-cols-2 gap-5">
      <Text required label="Professional / brand name" value={f.professional_name} onChange={(v) => set("professional_name", v)} />
      <div className="sm:col-span-2">
        <Label required hint="Select all that apply. Medical Aesthetics applies stricter AHPRA-aware rules to generated content automatically.">Categories</Label>
        <div className="flex flex-wrap gap-1.5">
          {CATEGORY_OPTIONS.map((opt) => {
            const on = selected.includes(opt.id);
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => toggleCategory(opt.id)}
                className={
                  "px-3 py-1.5 text-[11px] tracking-wide border hairline transition-colors " +
                  (on ? "bg-foreground text-offwhite" : "bg-card hover:bg-nude/30")
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>
      <Text label="What is your signature?" value={f.niche} onChange={(v) => set("niche", v)} placeholder={SIGNATURE_PLACEHOLDERS} hint="What are you known for — the specific thing clients book you for?" />
      <Text label="Location" value={f.location} onChange={(v) => set("location", v)} placeholder="City or suburb" />
      <Text label="Service area" value={f.service_area} onChange={(v) => set("service_area", v)} placeholder="Mobile / clinic / studio…" />
      <Text label="Strongest reputation asset" value={f.reputation_asset} onChange={(v) => set("reputation_asset", v)} placeholder="Technique, taste, discretion…" />
      <div className="sm:col-span-2">
        <Area label="What do you want to be known for?" value={f.known_for} onChange={(v) => set("known_for", v)}
          placeholder="Natural-looking skin, calm expertise and meticulous prep." />
      </div>
      <div className="sm:col-span-2">
        <Area label="What makes your work different?" value={f.what_makes_different} onChange={(v) => set("what_makes_different", v)}
          placeholder="I focus on skin that still looks like skin, not heavy coverage." />
      </div>
    </div>
  );
}


function S2Essence({ record, patch }: S) {
  const e = record.essence;
  const set = (k: keyof typeof e, v: string) => patch({ essence: { ...e, [k]: v } });
  return (
    <div className="space-y-5">
      <Area required label="Brand essence in one sentence" value={e.one_sentence} onChange={(v) => set("one_sentence", v)}
        placeholder="Give clients the calm confidence that they look like the best version of themselves." />
      <Area label="Brand world anchor" value={e.world_anchor} onChange={(v) => set("world_anchor", v)}
        placeholder="A quiet Aesop store, a Sofia Coppola interior, the pages of Cereal." />
      <Select required label="Image energy" value={e.image_energy} onChange={(v) => set("image_energy", v as typeof e.image_energy)}
        options={[
          { value: "still_quiet", label: "Still and quiet" },
          { value: "calm_warm", label: "Calm and warm" },
          { value: "confident_editorial", label: "Confident and editorial" },
          { value: "energetic_bright", label: "Energetic and bright" },
          { value: "soft_clinical", label: "Soft clinical" },
          { value: "contemporary_cool", label: "Contemporary cool" },
        ]} />
    </div>
  );
}

// ─── Phase 2: visual style cards ──────────────────────────────────────

const VISUAL_STYLE_CARDS: Array<{
  id: import("./schema").VisualStyleCard;
  title: string;
  blurb: string;
}> = [
  { id: "quiet_luxury",       title: "Quiet Luxury",        blurb: "Hushed palette, restraint, money you can feel but not see." },
  { id: "editorial_beauty",   title: "Editorial Beauty",    blurb: "Magazine-grade composition with confident negative space." },
  { id: "clinical_minimalist",title: "Clinical Minimalist", blurb: "Cool whites, crisp light, surgical clarity." },
  { id: "warm_wellness",      title: "Warm Wellness",       blurb: "Sun-warmed neutrals, soft skin, slow ritual." },
  { id: "contemporary_cool",  title: "Contemporary Cool",   blurb: "Cropped angles, low-saturation colour, considered tension." },
  { id: "soft_feminine",      title: "Soft Feminine",       blurb: "Powdery palette, gentle light, romantic stillness." },
  { id: "bold_campaign",      title: "Bold Campaign",       blurb: "Type-led posters, hero subjects, advertising-grade impact." },
  { id: "natural_organic",    title: "Natural / Organic",   blurb: "Linen, timber, daylight, nothing styled to perfection." },
  { id: "high_fashion",       title: "High Fashion",        blurb: "Couture poses, hard light, runway-level styling." },
  { id: "polished_commercial",title: "Polished Commercial", blurb: "Clean, retouched, billboard-ready brand work." },
];

// Map a legacy free-form `visual_style` string to up to 3 ranking cards.
// Used once on first load when the new ranking is empty.
const LEGACY_STYLE_HINTS: Record<string, import("./schema").VisualStyleCard> = {
  "quiet luxury": "quiet_luxury",
  luxury: "quiet_luxury",
  editorial: "editorial_beauty",
  magazine: "editorial_beauty",
  clinical: "clinical_minimalist",
  minimal: "clinical_minimalist",
  minimalist: "clinical_minimalist",
  wellness: "warm_wellness",
  warm: "warm_wellness",
  contemporary: "contemporary_cool",
  cool: "contemporary_cool",
  feminine: "soft_feminine",
  soft: "soft_feminine",
  campaign: "bold_campaign",
  bold: "bold_campaign",
  natural: "natural_organic",
  organic: "natural_organic",
  fashion: "high_fashion",
  couture: "high_fashion",
  commercial: "polished_commercial",
  polished: "polished_commercial",
};

function deriveRankingFromLegacy(text: string): import("./schema").VisualStyleCard[] {
  if (!text) return [];
  const lower = text.toLowerCase();
  const out: import("./schema").VisualStyleCard[] = [];
  for (const [needle, id] of Object.entries(LEGACY_STYLE_HINTS)) {
    if (lower.includes(needle) && !out.includes(id)) out.push(id);
    if (out.length === 3) break;
  }
  return out;
}

function StyleRankingCards({
  ranking,
  onChange,
}: {
  ranking: import("./schema").VisualStyleCard[];
  onChange: (next: import("./schema").VisualStyleCard[]) => void;
}) {
  function toggle(id: import("./schema").VisualStyleCard) {
    if (ranking.includes(id)) {
      onChange(ranking.filter((r) => r !== id));
      return;
    }
    if (ranking.length >= 3) return;
    onChange([...ranking, id]);
  }
  function move(id: import("./schema").VisualStyleCard, dir: -1 | 1) {
    const idx = ranking.indexOf(id);
    if (idx < 0) return;
    const j = idx + dir;
    if (j < 0 || j >= ranking.length) return;
    const next = [...ranking];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  }
  return (
    <div>
      <Label hint="Pick your top three. Order matters — number 1 has the strongest pull on every generation.">
        Visual style ranking
      </Label>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
        {VISUAL_STYLE_CARDS.map((card) => {
          const rank = ranking.indexOf(card.id);
          const picked = rank >= 0;
          const disabled = !picked && ranking.length >= 3;
          return (
            <button
              key={card.id}
              type="button"
              onClick={() => toggle(card.id)}
              disabled={disabled}
              aria-pressed={picked}
              className={
                "text-left border hairline p-3 transition-colors min-h-[110px] flex flex-col justify-between " +
                (picked
                  ? "bg-foreground text-offwhite"
                  : disabled
                    ? "bg-card opacity-40 cursor-not-allowed"
                    : "bg-card hover:bg-nude/30")
              }
            >
              <div className="flex items-start justify-between gap-2">
                <p className={"text-[11px] uppercase tracking-widest " + (picked ? "text-nude" : "text-taupe")}>
                  {picked ? `#${rank + 1}` : "Tap to pick"}
                </p>
                {picked && (
                  <span className="flex gap-1">
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); move(card.id, -1); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); move(card.id, -1); } }}
                      className="text-[10px] px-1 border border-offwhite/40 hover:bg-offwhite/10 leading-none py-0.5"
                      aria-label={`Move ${card.title} up`}
                    >↑</span>
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => { e.stopPropagation(); move(card.id, 1); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); move(card.id, 1); } }}
                      className="text-[10px] px-1 border border-offwhite/40 hover:bg-offwhite/10 leading-none py-0.5"
                      aria-label={`Move ${card.title} down`}
                    >↓</span>
                  </span>
                )}
              </div>
              <div>
                <p className="font-serif text-base leading-tight mb-1">{card.title}</p>
                <p className={"text-[11px] leading-snug " + (picked ? "text-nude/90" : "text-taupe")}>{card.blurb}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LogoUpload({
  storagePath,
  onPathChange,
}: {
  storagePath: string | null;
  onPathChange: (path: string | null) => void;
}) {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const [signedUrl, setSignedUrl] = useState<string | null>(null);
  const [localPreview, setLocalPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!storagePath || !cloudEnabled) {
      setSignedUrl(null);
      return;
    }
    signOne(storagePath).then((url) => {
      if (!cancelled) setSignedUrl(url);
    });
    return () => {
      cancelled = true;
    };
  }, [storagePath, cloudEnabled]);

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setWarn(null);
    if (!cloudEnabled) {
      // Local-only preview, no upload.
      const blobUrl = URL.createObjectURL(file);
      setLocalPreview(blobUrl);
      setWarn("Sign in with cloud enabled to save this file. Currently this is a local preview only.");
      return;
    }
    setBusy(true);
    const res = await uploadBrandFile(file, "logo");
    setBusy(false);
    if (res.kind === "ok") {
      // Safer replacement sequence:
      //  1. New file is already uploaded.
      //  2. Patch the new logo_storage_path into the record (in-memory "save").
      //  3. Queue the OLD path for deletion — it will only be removed
      //     after the form is durably saved to the database.
      //  4. If the form save later fails, the new path is rolled back
      //     and the old reference stays intact.
      if (storagePath && storagePath !== res.path) {
        queueDeleteOnSave(storagePath);
      }
      onPathChange(res.path);
      setSignedUrl(res.signedUrl);
      setLocalPreview(null);
    } else if (res.kind === "anon") {
      setWarn("Please sign in to save your logo.");
    } else if (res.kind === "invalid") {
      setWarn(res.message);
    } else {
      setWarn(res.message);
    }
  }

  async function clear() {
    // Defer the storage delete until the form is saved, so a closed-tab
    // mid-edit doesn't strand the DB row pointing at a missing object.
    if (storagePath && cloudEnabled) queueDeleteOnSave(storagePath);
    onPathChange(null);
    setSignedUrl(null);
    setLocalPreview(null);
  }

  const display = signedUrl || localPreview;

  return (
    <div>
      <Label hint="Square or wordmark logo. JPG, PNG or WebP, up to 5MB. Replaced files are deleted only after a successful save.">
        Logo file
      </Label>
      <div className="flex items-start gap-4">
        <div className="w-24 h-24 border hairline bg-nude/20 flex items-center justify-center overflow-hidden shrink-0">
          {display ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={display} alt="Logo preview" className="max-w-full max-h-full object-contain" />
          ) : (
            <span className="text-[10px] uppercase tracking-widest text-taupe">No logo</span>
          )}
        </div>
        <div className="flex-1 space-y-2">
          <label className="inline-block border hairline px-4 py-2 text-[11px] uppercase tracking-[0.2em] bg-card hover:bg-nude/30 cursor-pointer">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
              disabled={busy}
            />
            {busy ? "Uploading…" : storagePath ? "Replace logo" : "Upload logo"}
          </label>
          {(storagePath || localPreview) && (
            <button
              type="button"
              onClick={clear}
              className="ml-2 text-[11px] uppercase tracking-[0.2em] text-taupe hover:text-foreground"
            >
              Remove
            </button>
          )}
          {!cloudEnabled && (
            <p className="text-[11px] text-taupe">Cloud backend off — uploads are not saved.</p>
          )}
          {warn && <p className="text-[11px] text-foreground">{warn}</p>}
        </div>
      </div>
    </div>
  );
}

function S3Visual({ record, patch }: S) {
  const v = record.visual_identity;
  const setPalette = (k: keyof typeof v.palette, val: string) =>
    patch({ visual_identity: { ...v, palette: { ...v.palette, [k]: val } } });
  const set = (k: keyof typeof v, val: string) => patch({ visual_identity: { ...v, [k]: val } });
  const positions = [
    { value: "bottom_right", label: "Bottom Right" },
    { value: "bottom_left", label: "Bottom Left" },
    { value: "top_right", label: "Top Right" },
    { value: "top_left", label: "Top Left" },
  ];
  // Seed ranking from legacy visual_style description on first interaction.
  // We only do this when the ranking is empty and there is something to map.
  useEffect(() => {
    if (v.style_ranking.length > 0) return;
    // legacy visual_style scalar is not on the new record, so we skip
    // unless the user typed something into "never look like" / hints —
    // safe no-op when nothing matches.
    const guess = deriveRankingFromLegacy(`${v.never_look_like} ${v.colours_to_avoid}`);
    if (guess.length > 0) {
      patch({ visual_identity: { ...v, style_ranking: guess } });
    }
    // intentionally one-shot; the ranking is user-controlled after this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <Label hint="Five working colours. Only Primary is required.">Palette</Label>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <Color required label="Primary" value={v.palette.primary} onChange={(val) => setPalette("primary", val)} />
          <Color label="Secondary" value={v.palette.secondary} onChange={(val) => setPalette("secondary", val)} />
          <Color label="Background" value={v.palette.background} onChange={(val) => setPalette("background", val)} />
          <Color label="Accent" value={v.palette.accent} onChange={(val) => setPalette("accent", val)} />
          <Color label="Depth" value={v.palette.depth} onChange={(val) => setPalette("depth", val)} />
        </div>
      </div>

      <LogoUpload
        storagePath={record.logo_storage_path}
        onPathChange={(path) => patch({ logo_storage_path: path })}
      />

      <div className="grid sm:grid-cols-2 gap-5">
        <Text label="Colours to avoid" value={v.colours_to_avoid} onChange={(val) => set("colours_to_avoid", val)}
          placeholder="No neon, no hot pink, no clinical blue." />
        <Select label="Logo position on asset" value={record.logo_position ?? ""}
          onChange={(val) => patch({ logo_position: (val || null) as BrandDnaRecord["logo_position"] })}
          options={positions} />
      </div>
      <Area label="Logo usage rules" value={v.logo_usage_rules} onChange={(val) => set("logo_usage_rules", val)}
        placeholder="Always on neutral backgrounds. Never resized below 24px or rotated." />

      <StyleRankingCards
        ranking={v.style_ranking}
        onChange={(next) => patch({ visual_identity: { ...v, style_ranking: next } })}
      />

      <Area label="What should your brand never look like?" value={v.never_look_like} onChange={(val) => set("never_look_like", val)}
        placeholder="Not stock-photo, not cartoon, not cluttered, not cheap spa luxury, no neon, no hot pink, no clinical blue." />
    </div>
  );
}

function S5ImageDirection({ record, patch }: S) {
  const d = record.image_direction;
  const set = <K extends keyof typeof d>(k: K, val: (typeof d)[K]) => patch({ image_direction: { ...d, [k]: val } });
  return (
    <div className="space-y-5">
      <div className="border-l hairline pl-3 text-[11px] text-foreground leading-relaxed">
        Elle.Be.O does not generate people or alter how real people look. Image generation is used for brand-safe visual direction such as lighting, background, texture, colour, composition and layout.
      </div>
      <MultiChip label="Preferred lighting" values={d.lighting} onChange={(v) => set("lighting", v)}
        options={["Soft natural light", "Clean flash", "Moody shadows", "Bright clinical light", "Soft directional daylight", "Warm ambient light"]} />
      <MultiChip label="Preferred composition" values={d.composition} onChange={(v) => set("composition", v)}
        options={["Close-up product", "Flat lay", "Hands at work", "Wide salon/clinic shot", "Product detail", "Negative space", "Cropped editorial", "Tabletop styling"]} />
      <MultiChip label="Preferred environments" values={d.environments} onChange={(v) => set("environments", v)}
        options={["Salon", "Clinic", "Studio", "Neutral backdrop", "Textured wall", "Lifestyle bathroom", "Luxury hotel", "Home vanity", "Backstage", "Bridal suite"]} />
      <Text label="Other environments" value={d.environments_other} onChange={(v) => set("environments_other", v)}
        placeholder="Anything else worth noting" />
      <MultiChip label="Textures / materials" values={d.textures} onChange={(v) => set("textures", v)}
        options={["Linen", "Marble", "Chrome", "Glass", "Ceramic", "Paper", "Timber", "Brushed metal", "Stone", "Silk"]} />
      <Select label="Visual treatment" value={d.realism} onChange={(v) => set("realism", v)}
        hint="Style of brand-safe imagery — never used to alter how real people look."
        options={["Realistic photography", "Editorial photography", "Mixed media", "Minimal graphic", "Text-led graphic"].map((x) => ({ value: x, label: x }))} />
    </div>
  );
}


function S6Output({ record, patch }: S) {
  const o = record.output_formats;
  const set = <K extends keyof typeof o>(k: K, v: (typeof o)[K]) => patch({ output_formats: { ...o, [k]: v } });
  return (
    <div className="space-y-5">
      <MultiChip label="Platforms in use" values={o.platforms} onChange={(v) => set("platforms", v)}
        options={["Instagram feed", "Instagram stories", "LinkedIn", "Pinterest", "Website"]} />
      <MultiChip label="Default aspect ratios" values={o.aspect_ratios} onChange={(v) => set("aspect_ratios", v)}
        options={["Feed 4:5", "Square 1:1", "Story/Reel 9:16", "LinkedIn 1.91:1"]} />
      <div className="grid sm:grid-cols-2 gap-5">
        <Select label="Safe zone preset" value={o.safe_zone_preset} onChange={(v) => set("safe_zone_preset", v)}
          options={["Top & bottom 15%", "Top 20%", "Bottom 25%", "Centred third", "Custom"].map((x) => ({ value: x, label: x }))} />
        <Text label="Safe zone rule" value={o.safe_zone_rule} onChange={(v) => set("safe_zone_rule", v)}
          placeholder="Keep top and bottom 15% clear for headlines and the story interface." />
      </div>
      <MultiChip label="Finish and treatment" values={o.finish} onChange={(v) => set("finish", v)}
        options={["Matte", "Subtle film grain", "Clean digital", "Soft focus", "High clarity"]} />
    </div>
  );
}

const FONT_OPTIONS = [
  "Playfair Display",
  "Cormorant Garamond",
  "Libre Baskerville",
  "DM Serif Display",
  "Lora",
  "Inter",
  "Manrope",
  "Neue Haas Grotesk style",
  "Avenir style",
  "Helvetica Neue style",
].map((x) => ({ value: x, label: x }));

function S7Typography({ record, patch }: S) {
  const t = record.typography;
  const set = (k: keyof typeof t, v: string) => patch({ typography: { ...t, [k]: v } });
  const isCustomHeading = t.heading_font && !FONT_OPTIONS.some((o) => o.value === t.heading_font);
  const isCustomBody = t.body_font && !FONT_OPTIONS.some((o) => o.value === t.body_font);
  return (
    <div className="space-y-5">
      <Area label="Type personality" value={t.personality} onChange={(v) => set("personality", v)}
        placeholder="Refined serif for headings, quiet sans for body. Classic, not trendy." />
      <div className="grid sm:grid-cols-2 gap-5">
        <div>
          <Select label="Heading style" value={isCustomHeading ? "__other__" : t.heading_font}
            onChange={(v) => set("heading_font", v === "__other__" ? (t.heading_font || " ") : v)}
            options={[...FONT_OPTIONS, { value: "__other__", label: "Other…" }]} />
          {isCustomHeading && (
            <input className={inputCls + " mt-2"} value={t.heading_font}
              placeholder="Custom heading font name" onChange={(e) => set("heading_font", e.target.value)} />
          )}
        </div>
        <div>
          <Select label="Body style" value={isCustomBody ? "__other__" : t.body_font}
            onChange={(v) => set("body_font", v === "__other__" ? (t.body_font || " ") : v)}
            options={[...FONT_OPTIONS, { value: "__other__", label: "Other…" }]} />
          {isCustomBody && (
            <input className={inputCls + " mt-2"} value={t.body_font}
              placeholder="Custom body font name" onChange={(e) => set("body_font", e.target.value)} />
          )}
        </div>
      </div>
      <Text label="Capitalisation rule" value={t.case_rule} onChange={(v) => set("case_rule", v)}
        placeholder="Sentence case for headlines, small caps for labels, never all-caps shouting." />
      <Text label="Text placement habit" value={t.text_placement} onChange={(v) => set("text_placement", v)}

        placeholder="Text usually sits in the lower third or in generous negative space." />
    </div>
  );
}

function S8Voice({ record, patch }: S) {
  const v = record.voice_v2;
  const set = <K extends keyof typeof v>(k: K, val: (typeof v)[K]) => patch({ voice_v2: { ...v, [k]: val } });
  return (
    <div className="space-y-5">
      <Text label="Three words for how you speak" value={v.three_words} onChange={(val) => set("three_words", val)}
        placeholder="Calm, expert, warm" />
      <Area label="How do you want to be perceived?" value={v.perception} onChange={(val) => set("perception", val)} />
      <Area label="What should every post prove?" value={v.proof} onChange={(val) => set("proof", val)} />
      <Area label="Words and phrases you use often (vocabulary)" value={v.vocabulary} onChange={(val) => set("vocabulary", val)} />
      <Text label="Caption style / tone in one line" value={v.caption_style} onChange={(val) => set("caption_style", val)}
        placeholder="Quiet authority with a generous moment of warmth at the end." />
      <div className="grid sm:grid-cols-2 gap-5">
        <Select label="Emoji usage" value={v.emoji_usage} onChange={(val) => set("emoji_usage", val as typeof v.emoji_usage)}
          options={[
            { value: "none", label: "None" },
            { value: "minimal", label: "Minimal (1–2)" },
            { value: "moderate", label: "Moderate (occasional)" },
            { value: "expressive", label: "Expressive" },
          ]} />
        <Select label="Caption length" value={v.caption_length} onChange={(val) => set("caption_length", val as typeof v.caption_length)}
          options={[
            { value: "short", label: "Short (50–80)" },
            { value: "medium", label: "Medium (80–130)" },
            { value: "long", label: "Long (130–200)" },
          ]} />
      </div>
    </div>
  );
}

function S9Written({ record, patch }: S) {
  const w = record.written_conventions;
  const set = <K extends keyof typeof w>(k: K, v: (typeof w)[K]) => patch({ written_conventions: { ...w, [k]: v } });
  const phrasesText = w.avoid_phrases.join(", ");
  return (
    <div className="space-y-5">
      <Select label="Spelling variant" value={w.spelling_variant} onChange={(v) => set("spelling_variant", v)}
        options={[{ value: "au_uk", label: "Australian / British English" }, { value: "us", label: "US English" }]} />
      <Area label="Punctuation rules" value={w.punctuation_rules} onChange={(v) => set("punctuation_rules", v)}
        placeholder="No em dashes. No excessive exclamation marks. Use calm, clean punctuation." />
      <Area label="Words/names always written a certain way" value={w.always_write} onChange={(v) => set("always_write", v)}
        placeholder="Elle.Be.O always written this way. AHPRA always capitalised." />
      <Area label="Words and phrases to avoid (comma separated)" value={phrasesText}
        onChange={(v) => set("avoid_phrases", v.split(",").map((s) => s.trim()).filter(Boolean))}
        placeholder="Anti-ageing miracle, flawless, cheap, quick fix, guaranteed result" />
    </div>
  );
}

function S10Commercial({ record, patch }: S) {
  const c = record.commercial;
  const set = <K extends keyof typeof c>(k: K, v: (typeof c)[K]) => patch({ commercial: { ...c, [k]: v } });
  return (
    <div className="space-y-5">
      <div className="grid sm:grid-cols-2 gap-5">
        <Text label="Hero service to grow" value={c.hero_service} onChange={(v) => set("hero_service", v)} />
        <Text label="Outcome clients want" value={c.desired_outcome} onChange={(v) => set("desired_outcome", v)} />
      </div>
      <Area label="Secondary services" value={c.secondary_services_text} onChange={(v) => set("secondary_services_text", v)} />
      <Area label="Proof points" value={c.proof_points} onChange={(v) => set("proof_points", v)}
        placeholder="Years experience, training lineage, signature techniques, notable bookings." />
      <div className="grid sm:grid-cols-2 gap-5">
        <Select label="Market tier" value={c.market_tier} onChange={(v) => set("market_tier", v as typeof c.market_tier)}
          options={[
            { value: "luxury", label: "Luxury" },
            { value: "mainstream", label: "Mainstream" },
            { value: "accessible", label: "Accessible" },
          ]} />
        <Select label="CTA style" value={c.cta_style} onChange={(v) => set("cta_style", v)}
          options={["Soft invitation", "Direct booking", "Educational", "Waitlist", "Consultation prompt", "Availability prompt"].map((x) => ({ value: x, label: x }))} />
      </div>
      <MultiChip label="Content objectives" values={c.content_objectives} onChange={(v) => set("content_objectives", v)}
        options={["Attract new clients", "Sell a service", "Educate", "Build authority", "Increase rebooking", "Launch an offer", "Fill cancellations"]} />
    </div>
  );
}

function S11IdealClient({ record, patch }: S) {
  const ic = record.ideal_client_v2;
  const set = (k: keyof typeof ic, v: string) => patch({ ideal_client_v2: { ...ic, [k]: v } });
  return (
    <div className="space-y-5">
      <Area label="Who is your ideal client?" value={ic.summary} onChange={(v) => set("summary", v)}
        placeholder="A time-poor professional who wants to look polished without needing to explain everything." />
      <div className="grid sm:grid-cols-2 gap-5">
        <Text label="Age range" value={ic.age_range} onChange={(v) => set("age_range", v)} placeholder="28–48" />
        <Text label="Gender identity / audience" value={ic.audience_gender} onChange={(v) => set("audience_gender", v)} placeholder="All genders / Femme-leaning / etc." />
      </div>
      <Area label="Lifestyle profile" value={ic.lifestyle} onChange={(v) => set("lifestyle", v)} />
      <div className="grid sm:grid-cols-2 gap-5">
        <Area label="What are they trying to solve?" value={ic.problem} onChange={(v) => set("problem", v)} />
        <Area label="What do they want to feel after booking?" value={ic.feeling_after_booking} onChange={(v) => set("feeling_after_booking", v)} />
        <Area label="Buying motivation" value={ic.buying_motivation} onChange={(v) => set("buying_motivation", v)} />
        <Area label="Fears and objections" value={ic.fears_objections} onChange={(v) => set("fears_objections", v)}
          placeholder="They fear looking overdone, wasting money, being sold to, or trusting the wrong person." />
        <Area label="What makes them trust someone?" value={ic.trust_signals} onChange={(v) => set("trust_signals", v)} />
        <Area label="What do they value enough to pay more for?" value={ic.pays_more_for} onChange={(v) => set("pays_more_for", v)} />
        <Area label="Visual taste references" value={ic.visual_taste} onChange={(v) => set("visual_taste", v)} />
        <Area label="Client language" value={ic.client_language} onChange={(v) => set("client_language", v)} />
      </div>
      <Area label="Language that would make them leave" value={ic.language_to_avoid} onChange={(v) => set("language_to_avoid", v)} />
    </div>
  );
}

function S12ContentStrategy({ record, patch }: S) {
  const cs = record.content_strategy;
  const set = <K extends keyof typeof cs>(k: K, v: (typeof cs)[K]) => patch({ content_strategy: { ...cs, [k]: v } });
  return (
    <div className="space-y-5">
      <MultiChip label="Content pillars (tap to add)" values={cs.pillars_ranked} onChange={(v) => set("pillars_ranked", v)}
        hint="Tap to add. The order you select becomes the ranking."
        options={["Transformations", "Education", "Behind the Scenes", "Client Stories", "Availability", "Personal Brand", "Authority", "Service Campaigns", "Seasonal Content"]} />
      <MultiChip label="Preferred output formats" values={cs.output_formats} onChange={(v) => set("output_formats", v)}
        options={["Feed post", "Story", "Carousel cover", "Quote tile", "Treatment campaign", "Launch graphic", "Availability post", "Testimonial graphic", "Educational carousel"]} />
      <Area label="Per-pillar treatment notes" value={cs.pillar_notes} onChange={(v) => set("pillar_notes", v)}
        placeholder="Education should feel clean and instructional. Results should feel quiet and credible. Campaign content can be more editorial." />
      <div className="grid sm:grid-cols-2 gap-5">
        <Text label="Bookings per week target" value={cs.targets.bookings_per_week}
          onChange={(v) => set("targets", { ...cs.targets, bookings_per_week: v })} />
        <Text label="Posts per week" value={cs.targets.posts_per_week}
          onChange={(v) => set("targets", { ...cs.targets, posts_per_week: v })} />
      </div>
      <p className="text-[11px] text-taupe leading-relaxed border-l hairline pl-3">
        Generated outputs are routed across distinct creative directions (editorial, educational, quote-led, campaign-led, service-led), not minor variants of the same image.
      </p>
    </div>
  );
}

function S15Compliance({ record, patch }: S) {
  const c = record.compliance;
  const checked = c.medical_aesthetics_practitioner === true;
  function toggle(v: boolean) {
    // Keep `regulated_ack` mirrored so background prompt assembly continues
    // to apply the stricter rule set without the user managing two flags.
    patch({ compliance: { ...c, medical_aesthetics_practitioner: v, regulated_ack: v ? true : c.regulated_ack } });
  }
  return (
    <div className="space-y-5">
      <label className="flex items-start gap-3 border hairline bg-card p-4 cursor-pointer hover:bg-nude/30 transition-colors">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => toggle(v === true)}
          className="mt-0.5"
          aria-label="Medical Aesthetics practitioner"
        />
        <span className="text-sm text-foreground leading-relaxed">
          <span className="block font-medium">Are you a Medical Aesthetics practitioner?</span>
          <span className="mt-1 block text-xs text-taupe">
            If selected, Elle.Be.O applies stricter AHPRA-aware rules to your captions and image prompts in the background — no treatment encouragement, no guaranteed outcomes, no inappropriate before/after advertising, and no testimonials as advertising.
          </span>
        </span>
      </label>
      {checked && (
        <p className="text-[11px] text-taupe leading-relaxed border-l hairline pl-3">
          Stricter rules are now applied automatically. You do not need to manage detailed compliance settings.
        </p>
      )}
    </div>
  );
}



// ─── §17 Completion Score ─────────────────────────────────────────────

function S17Completion({
  record, onJump,
}: { record: BrandDnaRecord; onJump?: (id: SectionId) => void }) {
  const summary = useMemo(() => computeCompletion(record), [record]);
  const { percent, tier, milestones, nextSteps } = summary;

  return (
    <div className="space-y-7">
      {/* Headline score */}
      <div>
        <div className="flex items-baseline justify-between gap-4 mb-3">
          <p className="eyebrow">Brand DNA strength</p>
          <p className="text-[10px] uppercase tracking-widest text-taupe">
            Guidance only — saving is never blocked.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <h3 className="font-serif text-3xl sm:text-4xl leading-none tracking-tight">
            {percent}<span className="text-taupe text-2xl">%</span>
          </h3>
          <p className="text-sm sm:text-base text-foreground max-w-md">{tier.label}.</p>
        </div>
        <div className="mt-4 h-px bg-border relative" aria-hidden>
          <div
            className="absolute inset-y-0 left-0 bg-foreground"
            style={{ width: `${Math.max(2, percent)}%`, height: "2px", top: "-0.5px" }}
          />
        </div>
        <p className="mt-3 text-sm text-taupe leading-relaxed max-w-prose">{tier.helper}</p>
      </div>

      {/* Next steps */}
      {nextSteps.length > 0 && (
        <div className="border hairline bg-nude/20 p-4 sm:p-5">
          <p className="text-[10px] uppercase tracking-widest text-taupe mb-3">What would make your Brand DNA stronger</p>
          <ul className="space-y-2 text-sm text-foreground leading-relaxed">
            {nextSteps.map((step, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-taupe" aria-hidden>·</span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Milestone list */}
      <div>
        <p className="eyebrow mb-3">What we look for</p>
        <ul className="border hairline divide-y divide-border bg-card">
          {milestones.map((m) => (
            <MilestoneRow key={m.id} m={m} onJump={onJump} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function MilestoneRow({ m, onJump }: { m: Milestone; onJump?: (id: SectionId) => void }) {
  const pct = Math.round(m.progress * 100);
  const clickable = Boolean(onJump);
  const inner = (
    <div className="w-full p-4 sm:p-5 text-left">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2.5">
            <StatusDot status={m.status} />
            <p className="text-sm sm:text-base font-medium leading-tight">{m.title}</p>
          </div>
          <p className="text-xs sm:text-sm text-taupe mt-1.5 leading-relaxed">{m.hint}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[10px] uppercase tracking-widest text-taupe">{STATUS_LABEL[m.status]}</p>
          <p className="text-xs text-foreground mt-1 tabular-nums">{pct}%</p>
        </div>
      </div>
      <div className="mt-3 h-px bg-border relative" aria-hidden>
        <div
          className="absolute inset-y-0 left-0 bg-foreground"
          style={{ width: `${Math.max(2, pct)}%`, height: "2px", top: "-0.5px" }}
        />
      </div>
    </div>
  );
  return (
    <li>
      {clickable ? (
        <button
          type="button"
          onClick={() => onJump?.(m.jumpTo)}
          className="w-full hover:bg-nude/20 transition-colors"
        >
          {inner}
        </button>
      ) : (
        inner
      )}
    </li>
  );
}

const STATUS_LABEL: Record<MilestoneStatus, string> = {
  complete: "Complete",
  partial: "In progress",
  incomplete: "Not started",
};

function StatusDot({ status }: { status: MilestoneStatus }) {
  const cls =
    status === "complete"
      ? "bg-foreground"
      : status === "partial"
        ? "bg-foreground/50"
        : "bg-border";
  return <span className={`inline-block w-1.5 h-1.5 rounded-full ${cls}`} aria-hidden />;
}

// ─── Phase 2 sections ─────────────────────────────────────────────────

const MOODBOARD_USAGE_OPTIONS: Array<{ value: MoodboardUsage; label: string }> = [
  { value: "colour",     label: "Colour only" },
  { value: "mood",       label: "Mood only" },
  { value: "composition",label: "Composition only" },
  { value: "texture",    label: "Texture only" },
  { value: "lighting",   label: "Lighting only" },
  { value: "typography", label: "Typography only" },
  { value: "overall",    label: "Overall style direction" },
  { value: "ref_only",   label: "Reference only, do not recreate" },
  { value: "private",    label: "Do not use publicly" },
];

const MOODBOARD_MIN = 8;
const MOODBOARD_MAX = 20;
const MOODBOARD_PRIORITY_MAX = 3;

function newRefId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function useSignedUrlMap(paths: string[], enabled: boolean): Record<string, string> {
  const [map, setMap] = useState<Record<string, string>>({});
  const key = paths.join("|");
  useEffect(() => {
    let cancelled = false;
    if (!enabled || paths.length === 0) {
      setMap({});
      return;
    }
    signMany(paths).then((m) => {
      if (!cancelled) setMap(m);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  return map;
}

function S4Moodboard({ record, patch }: S) {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const refs = record.moodboard;
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  // Local-only blob URLs keyed by ref id, used when cloud is off.
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const signedMap = useSignedUrlMap(refs.map((r) => r.storage_path).filter(Boolean), cloudEnabled);

  const priorityCount = refs.filter((r) => r.is_priority).length;

  function setRefs(next: MoodboardRef[]) {
    patch({ moodboard: next });
  }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setWarn(null);
    const remaining = MOODBOARD_MAX - refs.length;
    const accepted = Array.from(files).slice(0, Math.max(0, remaining));
    if (accepted.length < files.length) {
      setWarn(`Capped at ${MOODBOARD_MAX} references — only the first ${accepted.length} added.`);
    }
    if (accepted.length === 0) return;

    setBusy(true);
    const added: MoodboardRef[] = [];
    const newBlobs: Record<string, string> = {};

    const rejected: string[] = [];
    for (const file of accepted) {
      const id = newRefId();
      if (!cloudEnabled) {
        const v = validateBrandFile(file, "moodboard");
        if (!v.ok) { rejected.push(`${file.name}: ${v.message}`); continue; }
        newBlobs[id] = URL.createObjectURL(file);
        added.push({
          id, storage_path: "", filename: file.name,
          usage: "", notes: "", is_priority: false,
        });
        continue;
      }
      const res = await uploadBrandFile(file, "moodboard");
      if (res.kind === "ok") {
        added.push({
          id, storage_path: res.path, filename: file.name,
          usage: "", notes: "", is_priority: false,
        });
      } else if (res.kind === "anon") {
        setWarn("Sign in to upload moodboard references.");
        break;
      } else if (res.kind === "invalid") {
        rejected.push(`${file.name}: ${res.message}`);
      } else {
        rejected.push(`${file.name}: ${res.message}`);
      }
    }
    setBusy(false);
    if (added.length > 0) setRefs([...refs, ...added]);
    if (Object.keys(newBlobs).length > 0) setBlobUrls((prev) => ({ ...prev, ...newBlobs }));
    if (rejected.length > 0) {
      setWarn(`${rejected.length} file${rejected.length === 1 ? "" : "s"} skipped — ${rejected[0]}`);
    } else if (!cloudEnabled) {
      setWarn("Cloud backend off — moodboard references are a local preview only and will not persist.");
    }
  }

  async function removeRef(id: string) {
    const ref = refs.find((r) => r.id === id);
    // Queue delete until the form is saved — if the user undoes by
    // navigating away we'd otherwise have stranded the DB row.
    if (ref?.storage_path && cloudEnabled) queueDeleteOnSave(ref.storage_path);
    setRefs(refs.filter((r) => r.id !== id));
    setBlobUrls(({ [id]: _gone, ...rest }) => rest);
  }

  function updateRef(id: string, patchRef: Partial<MoodboardRef>) {
    setRefs(refs.map((r) => (r.id === id ? { ...r, ...patchRef } : r)));
  }

  function togglePriority(id: string) {
    const ref = refs.find((r) => r.id === id);
    if (!ref) return;
    if (!ref.is_priority && priorityCount >= MOODBOARD_PRIORITY_MAX) return;
    updateRef(id, { is_priority: !ref.is_priority });
  }

  return (
    <div className="space-y-5">
      <div className="border-l hairline pl-3 text-[11px] text-foreground leading-relaxed">
        Do not copy exact designs or images. References shape direction; they are never recreated.
      </div>

      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className="text-xs text-taupe leading-relaxed">
          {refs.length} of {MOODBOARD_MAX} references{refs.length < MOODBOARD_MIN ? ` — aim for at least ${MOODBOARD_MIN}` : ""}.
          {" "}{priorityCount} of {MOODBOARD_PRIORITY_MAX} priority anchors used.
        </p>
        <label className="inline-block border hairline px-4 py-2 text-[11px] uppercase tracking-[0.2em] bg-card hover:bg-nude/30 cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            disabled={busy || refs.length >= MOODBOARD_MAX}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          {busy ? "Uploading…" : "Add references"}
        </label>
      </div>
      {warn && <p className="text-[11px] text-foreground">{warn}</p>}
      {!cloudEnabled && (
        <p className="text-[11px] text-taupe border hairline bg-nude/20 p-2">
          Cloud backend off — moodboard files are a local preview only. Enable the cloud flag and sign in to persist them.
        </p>
      )}

      {refs.length === 0 ? (
        <div className="border hairline bg-nude/20 p-6 text-center text-sm text-taupe">
          No references yet. Add 8–20 images and label what each one is for.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {refs.map((ref) => {
            const url = signedMap[ref.storage_path] || blobUrls[ref.id] || "";
            return (
              <div key={ref.id} className="border hairline bg-card p-3 space-y-2">
                <div className="relative aspect-square bg-nude/20 overflow-hidden">
                  {url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={url} alt={ref.filename} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-taupe">
                      {cloudEnabled ? "Loading…" : "Preview"}
                    </div>
                  )}
                  {ref.is_priority && (
                    <span className="absolute top-1 left-1 text-[10px] uppercase tracking-widest bg-foreground text-offwhite px-1.5 py-0.5">
                      Priority
                    </span>
                  )}
                </div>
                <select
                  className={inputCls + " text-xs"}
                  value={ref.usage}
                  onChange={(e) => updateRef(ref.id, { usage: e.target.value as MoodboardUsage | "" })}
                >
                  <option value="">Usage…</option>
                  {MOODBOARD_USAGE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <textarea
                  className={inputCls + " resize-none text-xs"}
                  rows={2}
                  placeholder="Notes — what about this reference matters?"
                  value={ref.notes}
                  onChange={(e) => updateRef(ref.id, { notes: e.target.value })}
                />
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => togglePriority(ref.id)}
                    disabled={!ref.is_priority && priorityCount >= MOODBOARD_PRIORITY_MAX}
                    className={
                      "text-[10px] uppercase tracking-widest px-2 py-1 border hairline transition-colors " +
                      (ref.is_priority
                        ? "bg-foreground text-offwhite"
                        : priorityCount >= MOODBOARD_PRIORITY_MAX
                          ? "opacity-40 cursor-not-allowed"
                          : "bg-card hover:bg-nude/30")
                    }
                  >
                    {ref.is_priority ? "Priority" : "Mark priority"}
                  </button>
                  <button
                    type="button"
                    onClick={() => removeRef(ref.id)}
                    className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground"
                  >
                    Remove
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── §13 Asset Library ────────────────────────────────────────────────

const ASSET_TYPE_OPTIONS: Array<{ value: AssetType; label: string }> = [
  { value: "headshot",       label: "Headshot" },
  { value: "work",           label: "Work example" },
  { value: "space",          label: "Salon / clinic / studio space" },
  { value: "tools",          label: "Tools" },
  { value: "products",       label: "Products" },
  { value: "previous_posts", label: "Previous posts" },
  { value: "textures",       label: "Textures" },
  { value: "behind_scenes",  label: "Behind the scenes" },
];

const ASSET_USAGE_OPTIONS: Array<{ value: AssetUsageRule; label: string }> = [
  { value: "often",                label: "Use often" },
  { value: "sometimes",            label: "Use sometimes" },
  { value: "ref_only",             label: "Reference only" },
  { value: "private_ref",          label: "Private reference only" },
  { value: "do_not_generate",      label: "Do not generate from this" },
  { value: "do_not_use_publicly",  label: "Do not use publicly" },
];

const ASSET_CONSENT_OPTIONS: Array<{ value: AssetConsentStatus; label: string }> = [
  { value: "owned",             label: "Owned by me" },
  { value: "client_consented",  label: "Client consented" },
  { value: "third_party",       label: "Third-party (licensed)" },
  { value: "pending",           label: "Consent pending" },
  { value: "no_consent",        label: "No consent" },
];

const LIBRARY_MIN = 10;
const LIBRARY_MAX = 30;

function S13AssetLibrary({ record, patch }: S) {
  const cloudEnabled = useFeatureFlag("feature_cloud_backend");
  const items = record.asset_library;
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const [blobUrls, setBlobUrls] = useState<Record<string, string>>({});

  const signedMap = useSignedUrlMap(items.map((i) => i.storage_path).filter(Boolean), cloudEnabled);

  function setItems(next: AssetLibraryItem[]) { patch({ asset_library: next }); }

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setWarn(null);
    const remaining = LIBRARY_MAX - items.length;
    const accepted = Array.from(files).slice(0, Math.max(0, remaining));
    if (accepted.length < files.length) {
      setWarn(`Capped at ${LIBRARY_MAX} assets — only the first ${accepted.length} added.`);
    }
    if (accepted.length === 0) return;

    setBusy(true);
    const added: AssetLibraryItem[] = [];
    const newBlobs: Record<string, string> = {};

    const rejected: string[] = [];
    for (const file of accepted) {
      const id = newRefId();
      if (!cloudEnabled) {
        const v = validateBrandFile(file, "library");
        if (!v.ok) { rejected.push(`${file.name}: ${v.message}`); continue; }
        newBlobs[id] = URL.createObjectURL(file);
        added.push({
          id, storage_path: "", filename: file.name,
          asset_type: "", usage_rule: "", consent_status: "", notes: "",
        });
        continue;
      }
      const res = await uploadBrandFile(file, "library");
      if (res.kind === "ok") {
        added.push({
          id, storage_path: res.path, filename: file.name,
          asset_type: "", usage_rule: "", consent_status: "", notes: "",
        });
      } else if (res.kind === "anon") {
        setWarn("Sign in to upload asset library files.");
        break;
      } else if (res.kind === "invalid") {
        rejected.push(`${file.name}: ${res.message}`);
      } else {
        rejected.push(`${file.name}: ${res.message}`);
      }
    }
    setBusy(false);
    if (added.length > 0) setItems([...items, ...added]);
    if (Object.keys(newBlobs).length > 0) setBlobUrls((prev) => ({ ...prev, ...newBlobs }));
    if (rejected.length > 0) {
      setWarn(`${rejected.length} file${rejected.length === 1 ? "" : "s"} skipped — ${rejected[0]}`);
    } else if (!cloudEnabled) {
      setWarn("Cloud backend off — asset library files are a local preview only and will not persist.");
    }
  }

  async function removeItem(id: string) {
    const item = items.find((i) => i.id === id);
    if (item?.storage_path && cloudEnabled) queueDeleteOnSave(item.storage_path);
    setItems(items.filter((i) => i.id !== id));
    setBlobUrls(({ [id]: _gone, ...rest }) => rest);
  }

  function updateItem(id: string, p: Partial<AssetLibraryItem>) {
    setItems(items.map((i) => (i.id === id ? { ...i, ...p } : i)));
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3 justify-between">
        <p className="text-xs text-taupe leading-relaxed">
          {items.length} of {LIBRARY_MAX} assets{items.length < LIBRARY_MIN ? ` — aim for at least ${LIBRARY_MIN}` : ""}.
          {" "}Private reference and Do-not-use-publicly files never appear in the public-facing prompt.
        </p>
        <label className="inline-block border hairline px-4 py-2 text-[11px] uppercase tracking-[0.2em] bg-card hover:bg-nude/30 cursor-pointer">
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            multiple
            className="hidden"
            disabled={busy || items.length >= LIBRARY_MAX}
            onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }}
          />
          {busy ? "Uploading…" : "Add assets"}
        </label>
      </div>
      {warn && <p className="text-[11px] text-foreground">{warn}</p>}
      {!cloudEnabled && (
        <p className="text-[11px] text-taupe border hairline bg-nude/20 p-2">
          Cloud backend off — asset library files are a local preview only.
        </p>
      )}

      {items.length === 0 ? (
        <div className="border hairline bg-nude/20 p-6 text-center text-sm text-taupe">
          No assets yet. Upload 10–30 of your own files: headshots, work, your space, tools, products, previous posts, textures, BTS.
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const url = signedMap[item.storage_path] || blobUrls[item.id] || "";
            const restricted =
              item.usage_rule === "private_ref" ||
              item.usage_rule === "do_not_use_publicly" ||
              item.usage_rule === "do_not_generate";
            return (
              <div key={item.id} className={"border hairline p-3 grid grid-cols-12 gap-3 " + (restricted ? "bg-nude/30" : "bg-card")}>
                <div className="col-span-12 sm:col-span-3">
                  <div className="aspect-square bg-nude/20 overflow-hidden">
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt={item.filename} className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-taupe">
                        {cloudEnabled ? "Loading…" : "Preview"}
                      </div>
                    )}
                  </div>
                  <p className="text-[10px] text-taupe mt-1 truncate" title={item.filename}>{item.filename}</p>
                </div>
                <div className="col-span-12 sm:col-span-9 grid sm:grid-cols-3 gap-2">
                  <select className={inputCls + " text-xs"} value={item.asset_type}
                    onChange={(e) => updateItem(item.id, { asset_type: e.target.value as AssetType | "" })}>
                    <option value="">Asset type…</option>
                    {ASSET_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select className={inputCls + " text-xs"} value={item.usage_rule}
                    onChange={(e) => updateItem(item.id, { usage_rule: e.target.value as AssetUsageRule | "" })}>
                    <option value="">Usage rule…</option>
                    {ASSET_USAGE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <select className={inputCls + " text-xs"} value={item.consent_status}
                    onChange={(e) => updateItem(item.id, { consent_status: e.target.value as AssetConsentStatus | "" })}>
                    <option value="">Consent status…</option>
                    {ASSET_CONSENT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  <div className="sm:col-span-3">
                    <textarea
                      className={inputCls + " resize-none text-xs"}
                      rows={2}
                      placeholder="Notes — context, restrictions, anything the AI should respect."
                      value={item.notes}
                      onChange={(e) => updateItem(item.id, { notes: e.target.value })}
                    />
                  </div>
                  <div className="sm:col-span-3 flex items-center justify-between gap-2">
                    {restricted && (
                      <span className="text-[10px] uppercase tracking-widest text-foreground border hairline px-2 py-1">
                        Restricted — not included in public prompt
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeItem(item.id)}
                      className="text-[10px] uppercase tracking-widest text-taupe hover:text-foreground ml-auto"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── §16 Signature System ─────────────────────────────────────────────

const SIGNATURE_FIELDS: Array<{
  key: keyof BrandDnaRecord["signature_system"];
  label: string;
  example: string;
}> = [
  { key: "recurring_motif",   label: "Recurring motif",   example: "A single line of warm light cutting across each frame." },
  { key: "framing_habit",     label: "Framing habit",     example: "Subject sits in the right third with generous negative space at the top." },
  { key: "colour_discipline", label: "Colour discipline", example: "Background and one accent only per image. Depth colour reserved for type." },
  { key: "type_rule",         label: "Type rule",         example: "Headlines always sentence-case serif, lower third, never centred over a busy image." },
  { key: "finish",            label: "Finish",            example: "Soft matte with a whisper of grain. Never glossy, never over-sharpened." },
  { key: "light_signature",   label: "Light signature",   example: "Single soft daylight source from the left, no fill. Shadow is part of the brand." },
  { key: "always_absent",     label: "What is always absent", example: "No stock-photo smiles, no neon, no clutter, no busy backgrounds." },
];

function S16Signature({ record, patch }: S) {
  const sig = record.signature_system;
  const set = (k: keyof typeof sig, v: string) => patch({ signature_system: { ...sig, [k]: v } });
  const filled = SIGNATURE_FIELDS.filter((f) => sig[f.key]?.trim().length).length;
  return (
    <div className="space-y-5">
      <p className="text-sm text-foreground leading-relaxed max-w-prose">
        Choose 5 to 7 non-negotiable rules that should be true of every generated asset. These become your brand's signature and guide every piece of content Elle.Be.O creates for you.
      </p>
      <div className="flex items-center gap-3 text-xs">
        <span className="border hairline px-2 py-1 text-[10px] uppercase tracking-widest">
          {filled} of {SIGNATURE_FIELDS.length} filled
        </span>
        <span className={filled >= 5 ? "text-foreground" : "text-taupe"}>
          {filled >= 5 ? "Strong signature." : "Fill at least 5 for a strong signature — not required to save."}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-5">
        {SIGNATURE_FIELDS.map((f) => (
          <Area
            key={f.key}
            label={f.label}
            value={sig[f.key]}
            onChange={(v) => set(f.key, v)}
            placeholder={f.example}
            rows={2}
          />
        ))}
      </div>
    </div>
  );
}

function PhaseDeferred({ phase: _phase, note }: { phase: "2" | "3"; note: string }) {
  return (
    <div className="text-sm text-taupe leading-relaxed">
      <p>{note}</p>
    </div>
  );
}

function RemovedSection() {
  return (
    <div className="text-sm text-taupe leading-relaxed">
      <p>This section is no longer part of the Brand DNA form.</p>
    </div>
  );
}


// ─── router ───────────────────────────────────────────────────────────

export function SectionBody({
  id, record, patch, onJump,
}: {
  id: SectionId; record: BrandDnaRecord; patch: Patch;
  onJump?: (id: SectionId) => void;
}) {
  switch (id) {
    case "foundations":         return <S1Foundations record={record} patch={patch} />;
    case "essence":             return <S2Essence record={record} patch={patch} />;
    case "visual_identity":     return <S3Visual record={record} patch={patch} />;
    case "moodboard":           return <S4Moodboard record={record} patch={patch} />;
    case "image_direction":     return <S5ImageDirection record={record} patch={patch} />;
    case "output_formats":      return <S6Output record={record} patch={patch} />;
    case "typography":          return <S7Typography record={record} patch={patch} />;
    case "voice":               return <S8Voice record={record} patch={patch} />;
    case "written_conventions": return <S9Written record={record} patch={patch} />;
    case "commercial":          return <S10Commercial record={record} patch={patch} />;
    case "ideal_client":        return <S11IdealClient record={record} patch={patch} />;
    case "content_strategy":    return <S12ContentStrategy record={record} patch={patch} />;
    case "asset_library":       return <S13AssetLibrary record={record} patch={patch} />;
    case "compliance":          return <S15Compliance record={record} patch={patch} />;
    case "signature_system":    return <S16Signature record={record} patch={patch} />;
    case "completion":          return <S17Completion record={record} onJump={onJump} />;
    default:                    return <PhaseDeferred phase="3" note="Coming soon." />;

  }
}
