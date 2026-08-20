import {
  Lock, Sparkles, Image as ImageIcon, ArrowLeftRight, ListOrdered, ListChecks,
  Scale, Tag, ReceiptText, CalendarClock, Quote, User, PartyPopper, PenLine, Check,
} from "lucide-react";
import type { ComponentType } from "react";

/**
 * "What are you posting today?" — the front of the Lab.
 *
 * The old form showed every control at once and, worse, put the inputs that
 * UNLOCK a post kind *below* the buttons they unlocked, so a locked button
 * looked broken rather than conditional. Choosing the kind first and then
 * asking only for what that kind needs turns a wall of fields into a flow.
 *
 * Kinds are grouped by what the studio is trying to achieve, not by how the
 * generator is built — a technician thinks "I want to sell something", not
 * "I want a rows block".
 */

export type PostKind = {
  id: string;
  label: string;
  brief: string;
  /** A glyph for the shape of the post — thirteen text blocks do not scan. */
  icon: ComponentType<{ className?: string }>;
  needsTwoPhotos?: boolean;
  needsPhoto?: boolean;
  needsOffer?: boolean;
  needsTestimonial?: boolean;
  needsOwnMessage?: boolean;
};

export const KIND_GROUPS: Array<{ title: string; hint: string; kinds: PostKind[] }> = [
  {
    title: "Show your work",
    hint: "Proof leads. Let the result do the persuading.",
    kinds: [
      { id: "", label: "Surprise me", brief: "Pick a kind you haven't been served recently.", icon: Sparkles },
      { id: "statement", label: "Statement", brief: "One strong image, one short headline.", needsPhoto: true, icon: ImageIcon },
      { id: "proof", label: "Before / after", brief: "Two photos, honest labels.", needsTwoPhotos: true, icon: ArrowLeftRight },
      { id: "process", label: "How it's done", brief: "Numbered steps through your technique.", icon: ListOrdered },
    ],
  },
  {
    title: "Teach something",
    hint: "The most-saved posts on the platform.",
    kinds: [
      { id: "tips", label: "Tips & aftercare", brief: "A short do and don't list.", icon: ListChecks },
      { id: "myth", label: "Myth vs fact", brief: "Correct a common misconception.", icon: Scale },
    ],
  },
  {
    title: "Sell something",
    hint: "Needs your real numbers — nothing here is invented.",
    kinds: [
      { id: "offer", label: "Offer or sale", brief: "A promotion with a clear deadline.", needsOffer: true, icon: Tag },
      { id: "menu", label: "Services & prices", brief: "A clean price list.", needsOffer: true, icon: ReceiptText },
      { id: "availability", label: "Openings", brief: "Slots left this week.", needsOffer: true, icon: CalendarClock },
    ],
  },
  {
    title: "Build the brand",
    hint: "Who you are, beyond the results.",
    kinds: [
      { id: "testimonial", label: "Client words", brief: "A real review, set large.", needsTestimonial: true, icon: Quote },
      { id: "intro", label: "Meet the artist", brief: "The person behind the chair.", needsPhoto: true, icon: User },
      { id: "occasion", label: "Celebration", brief: "A festival your community marks.", icon: PartyPopper },
      { id: "own", label: "Your own message", brief: "Your words, designed.", needsOwnMessage: true, icon: PenLine },
    ],
  },
];

const ALL_KINDS = KIND_GROUPS.flatMap((g) => g.kinds);

type Props = {
  value: string;
  onChange: (id: string) => void;
  photoCount: number;
  offerDetails: string;
  setOfferDetails: (v: string) => void;
  testimonial: string;
  setTestimonial: (v: string) => void;
  ownMessage: string;
  setOwnMessage: (v: string) => void;
};

function lockReason(k: PostKind, p: Props): string | null {
  if (k.needsTwoPhotos && p.photoCount < 2) return "Add two photos";
  if (k.needsPhoto && p.photoCount < 1) return "Add a photo";
  return null;
}

/** Does this kind still need something typed before it could generate? */
function needsTyping(k: PostKind, p: Props): boolean {
  if (k.needsOffer && !p.offerDetails.trim()) return true;
  if (k.needsTestimonial && !p.testimonial.trim()) return true;
  if (k.needsOwnMessage && !p.ownMessage.trim()) return true;
  return false;
}

/**
 * What this studio could post RIGHT NOW, in priority order.
 *
 * The picker used to open as thirteen equal choices, which answers "what kinds
 * exist" but not the question a technician actually arrives with — "what should
 * I post today?". These are ranked from what is genuinely on hand: the photos
 * just uploaded, the facts already typed. Nothing here invents a
 * recommendation; a kind only appears once it could actually run.
 */
function suggestions(p: Props): Array<{ kind: PostKind; why: string }> {
  const out: Array<{ kind: PostKind; why: string }> = [];
  const by = (id: string) => ALL_KINDS.find((k) => k.id === id)!;

  if (p.photoCount >= 2) out.push({ kind: by("proof"), why: "you have two photos" });
  if (p.photoCount === 1) out.push({ kind: by("statement"), why: "you have a photo" });
  if (p.offerDetails.trim()) out.push({ kind: by("offer"), why: "your offer is written" });
  if (p.testimonial.trim()) out.push({ kind: by("testimonial"), why: "you pasted a review" });
  if (p.ownMessage.trim()) out.push({ kind: by("own"), why: "your message is written" });

  // Nothing on hand yet: lead with the kinds that need no photo and no figures,
  // so the studio is never staring at a screen of locked buttons.
  if (out.length === 0) {
    out.push({ kind: by("tips"), why: "needs nothing but your expertise" });
    out.push({ kind: by("myth"), why: "needs nothing but your expertise" });
    out.push({ kind: by("occasion"), why: "no photo required" });
  }
  return out.slice(0, 3);
}

export function PostKindPicker(props: Props) {
  const { value, onChange } = props;
  const selected = ALL_KINDS.find((k) => k.id === value);

  return (
    <div className="space-y-5">
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm">
        Pick what the post is <em>for</em>. The studio handles how it looks.
      </p>

      {/* Ready now — answers "what should I post today?" before offering the
          full menu. Driven only by what is actually on hand. */}
      <div className="rounded-[8px] border border-pale-stone bg-soft-linen/60 p-3.5">
        <p className="text-[14px] tracking-[0.01em] text-ink mb-2.5 flex items-center gap-1.5">
          <Sparkles className="size-3.5 shrink-0" />
          Ready to make now
        </p>
        <div className="flex flex-wrap gap-2">
          {suggestions(props).map(({ kind, why }) => {
            const Icon = kind.icon;
            return (
              <button
                key={kind.id || "auto"}
                type="button"
                onClick={() => onChange(kind.id)}
                className={
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 transition-colors " +
                  // A chosen chip is marked, not blacked out. A solid near-black
                  // fill on a warm cream page reads as a hole punched in the
                  // section rather than as a selection.
                  (value === kind.id
                    ? "bg-ink/[0.06] text-ink border-ink"
                    : "bg-card border-pale-stone hover:border-ink")
                }
              >
                <Icon className="size-3 shrink-0" />
                <span className="text-[14px] tracking-[0.01em]">{kind.label}</span>
                <span className="text-[14px] tracking-[0.01em] opacity-60">— {why}</span>
              </button>
            );
          })}
        </div>
      </div>

      {KIND_GROUPS.map((group) => (
        <div key={group.title}>
          <p className="text-[18px] tracking-[0.01em] text-ink">{group.title}</p>
          <p className="text-[14px] tracking-[0.01em] text-graphite-warm mb-3">{group.hint}</p>
          <div className="grid grid-cols-2 gap-2">
            {group.kinds.map((k) => {
              const locked = lockReason(k, props);
              const active = value === k.id;
              const Icon = k.icon;
              // Three honest states rather than two: ready to run, needs a
              // photo it cannot generate (locked), or needs a fact typed —
              // which is NOT a lock, because choosing it is how you get asked.
              const pending = !locked && needsTyping(k, props);
              return (
                <button
                  key={k.id || "auto"}
                  type="button"
                  onClick={() => onChange(k.id)}
                  className={
                    "text-left rounded-[8px] border px-4 py-3 transition-colors " +
                    (active
                      ? "bg-soft-linen border-ink"
                      : "bg-muted border-transparent hover:border-ink/40") +
                    // Choosable, but visibly not ready: a disabled button in the
                    // step BEFORE the one that unlocks it is a dead end — there
                    // is nothing you can do about it from here.
                    (locked && !active ? " opacity-60" : "")
                  }
                >
                  <span className="flex items-center gap-1.5">
                    {locked
                      ? <Lock className="size-3 shrink-0 text-graphite-warm" />
                      : <Icon className="size-3.5 shrink-0 text-graphite-warm" />}
                    <span className={"text-[14px] font-medium tracking-[0.01em] " + (active ? "text-ink" : "text-ink/85")}>
                      {k.label}
                    </span>
                    {!locked && !pending && k.id && (
                      <Check className="size-3 shrink-0 text-sage ml-auto" aria-label="ready" />
                    )}
                  </span>
                  <span className="block text-[14px] tracking-[0.01em] text-graphite-warm mt-1 leading-snug">
                    {locked
                      ? locked + " next — pick this and we'll take you there"
                      : pending
                        ? k.brief + " — you'll add the details next"
                        : k.brief}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ))}

      {/* Only the input the CHOSEN kind actually needs — never a wall of fields. */}
      {selected?.needsOffer && (
        <Requirement
          label="Your sale, prices or openings"
          help="Every figure on the post comes from this. Nothing is invented."
          placeholder="20% off all lash refills, Tuesday to Thursday, ends 31 August. Classic refill $65, Volume refill $85."
          value={props.offerDetails}
          onChange={props.setOfferDetails}
        />
      )}
      {selected?.needsTestimonial && (
        <Requirement
          label="A real client review"
          help="Quoted word for word. Never reworded or written for you."
          placeholder={'"She actually listened to what I wanted." — Priya R.'}
          value={props.testimonial}
          onChange={props.setTestimonial}
        />
      )}
      {selected?.needsOwnMessage && (
        <Requirement
          label="Your message"
          help="Your words, designed around. They won't be replaced or embellished."
          placeholder="Closed next Monday for training — booking again from Tuesday."
          value={props.ownMessage}
          onChange={props.setOwnMessage}
        />
      )}
    </div>
  );
}

function Requirement({
  label, help, placeholder, value, onChange,
}: {
  label: string; help: string; placeholder: string; value: string; onChange: (v: string) => void;
}) {
  return (
    <div className="rounded-[8px] border border-pale-stone bg-soft-linen/60 p-3.5">
      <label className="text-[18px] tracking-[0.01em] text-ink">{label}</label>
      <textarea
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={2}
        placeholder={placeholder}
        className="field mt-2 tracking-[0.01em] resize-y"
      />
      <p className="text-[14px] tracking-[0.01em] text-graphite-warm mt-2">{help}</p>
    </div>
  );
}

/** Does the chosen kind still need something before it can generate? */
export function missingRequirement(
  kindId: string,
  v: { offerDetails: string; testimonial: string; ownMessage: string; photoCount: number },
): string | null {
  const k = ALL_KINDS.find((x) => x.id === kindId);
  if (!k) return null;
  if (k.needsTwoPhotos && v.photoCount < 2) return "This post needs two photos.";
  if (k.needsPhoto && v.photoCount < 1) return "This post needs a photo.";
  if (k.needsOffer && !v.offerDetails.trim()) return "Add your sale or price details.";
  if (k.needsTestimonial && !v.testimonial.trim()) return "Paste the client review you want to use.";
  if (k.needsOwnMessage && !v.ownMessage.trim()) return "Write the message you want on the post.";
  return null;
}
