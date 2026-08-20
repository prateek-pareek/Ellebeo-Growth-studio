/** Gemini Lab–only. Do not import from the /generate pipeline. */

import type { BlockKind, FormatContent } from './gemini-lab-blocks';

/**
 * Post formats — WHAT a post is, not what it looks like.
 *
 * This is deliberately not a template library. A format declares the content
 * a post carries (a `process` post has numbered steps; a `menu` post has
 * price rows). Placement, palette, photo shape, type scale, decoration and
 * grid regions all stay AI-authored, so two `process` posts can look nothing
 * alike. Format adds an axis of variety; it does not add a lookup table of
 * designs.
 *
 * Grounded in what actually performs for beauty studios: proof-led
 * before/afters, technique walkthroughs, myth-busting, aftercare lists,
 * price and availability cards, testimonials, and celebration posts — with
 * proof leading and the booking ask following belief.
 */

export type PostFormatId =
  | 'statement'
  | 'proof'
  | 'process'
  | 'myth'
  | 'tips'
  | 'menu'
  | 'offer'
  | 'availability'
  | 'testimonial'
  | 'intro'
  | 'occasion'
  | 'own';

export type PhotoNeed = 'required' | 'optional' | 'none' | 'pair';

export type PostFormat = {
  id: PostFormatId;
  label: string;
  /** Shown to the creative-director model so it can choose deliberately. */
  brief: string;
  photo: PhotoNeed;
  blocks: BlockKind[];
  /**
   * True when the format asserts facts the system does not hold — real
   * prices, a real client's words, real opening slots. These are only
   * offered when the caller supplies the data. Inventing a price or a
   * testimonial would publish a falsehood to a real studio's customers.
   */
  needsRealData: boolean;
};

export const POST_FORMATS: Record<PostFormatId, PostFormat> = {
  statement: {
    id: 'statement',
    label: 'Statement',
    brief: 'A single strong image with a short billboard headline. The classic feed post — use when the photograph itself is the argument.',
    photo: 'required',
    blocks: [],
    needsRealData: false,
  },
  proof: {
    id: 'proof',
    label: 'Before / after',
    brief: 'Two photos side by side with honest labels. Lead with the result; let the comparison do the persuading.',
    photo: 'pair',
    blocks: ['badge'],
    needsRealData: false,
  },
  process: {
    id: 'process',
    label: 'How it is done',
    brief: 'Numbered steps walking through the technique — lash mapping, colour formulation, nail shaping. Builds authority and gets saved.',
    photo: 'optional',
    blocks: ['steps'],
    needsRealData: false,
  },
  myth: {
    id: 'myth',
    label: 'Myth vs fact',
    brief: 'A common misconception set against the truth. Corrects bad advice and positions the studio as the expert.',
    photo: 'optional',
    blocks: ['checklist'],
    needsRealData: false,
  },
  tips: {
    id: 'tips',
    label: 'Tips & aftercare',
    brief: 'A short do/don\'t list — aftercare, "3 signs you need a refill", how to make it last. The most-saved format there is.',
    photo: 'optional',
    blocks: ['checklist'],
    needsRealData: false,
  },
  menu: {
    id: 'menu',
    label: 'Services & prices',
    brief: 'A clean service list with prices. Answers the question every prospective client is already asking.',
    photo: 'optional',
    blocks: ['rows'],
    needsRealData: true,
  },
  offer: {
    id: 'offer',
    label: 'Offer or sale',
    brief: 'A promotion with the saving stated plainly and a clear deadline. Direct booking driver.',
    photo: 'optional',
    blocks: ['badge', 'rows'],
    needsRealData: true,
  },
  availability: {
    id: 'availability',
    label: 'Openings',
    brief: 'Remaining appointment slots this week. Short, urgent, and books chairs the same day.',
    photo: 'none',
    blocks: ['badge', 'rows'],
    needsRealData: true,
  },
  testimonial: {
    id: 'testimonial',
    label: 'Client words',
    brief: 'A real client quote set large, with attribution. Social proof carries further than any claim the studio makes itself.',
    photo: 'optional',
    blocks: ['quote'],
    needsRealData: true,
  },
  intro: {
    id: 'intro',
    label: 'Meet the artist',
    brief: 'Who is behind the chair — training, philosophy, a day in the studio. Turns a service into a person.',
    photo: 'required',
    blocks: [],
    needsRealData: false,
  },
  occasion: {
    id: 'occasion',
    label: 'Celebration',
    brief: 'A festival, holiday or seasonal moment the studio\'s own community actually observes. Warm, timely, not salesy.',
    photo: 'optional',
    blocks: ['badge'],
    needsRealData: false,
  },
  own: {
    id: 'own',
    label: 'Your own message',
    brief: 'The studio supplied the message themselves. Design around their words — do not replace or embellish them.',
    photo: 'optional',
    blocks: [],
    needsRealData: false,
  },
};

export const ALL_FORMAT_IDS = Object.keys(POST_FORMATS) as PostFormatId[];

export function isPostFormatId(v: unknown): v is PostFormatId {
  return typeof v === 'string' && v in POST_FORMATS;
}

/**
 * Formats this generation may actually choose from.
 *
 * `needsRealData` formats are withheld unless the caller supplied the facts,
 * and photo requirements are matched against what was uploaded — so the model
 * is never offered a before/after when only one photo exists.
 */
export function availableFormats(ctx: {
  photoCount: number;
  hasFacts?: boolean;
  ownMessage?: string;
  /** Technician supplied real sale/price/availability facts. */
  hasOfferDetails?: boolean;
  /** Technician supplied a real client testimonial. Separate: an offer does not license a fake quote. */
  hasTestimonial?: boolean;
  /**
   * A generated studio still life stands in for an uploaded photo. It
   * satisfies formats that just need *an* image, but never those that assert
   * something about a real person or a real result — see below.
   */
  hasGeneratedImagery?: boolean;
}): PostFormat[] {
  const images = ctx.photoCount + (ctx.hasGeneratedImagery ? 1 : 0);
  return ALL_FORMAT_IDS.map((id) => POST_FORMATS[id]).filter((f) => {
    if (f.id === 'own') return !!ctx.ownMessage;
    // The fact gate is per KIND of fact. Sale details unlock the commercial
    // formats; they do not license inventing a client's words.
    if (f.id === 'testimonial' && !ctx.hasTestimonial) return false;
    if (f.needsRealData && f.id !== 'testimonial' && !(ctx.hasOfferDetails || ctx.hasFacts)) return false;
    // A before/after must be two real photographs of one real client, and
    // "meet the artist" must be an actual photograph of an actual person.
    // Generated imagery can never satisfy either without the post making a
    // false claim about the studio, so these stay off.
    if (f.id === 'proof' || f.id === 'intro') {
      if (f.photo === 'pair' && ctx.photoCount < 2) return false;
      if (f.photo === 'required' && ctx.photoCount < 1) return false;
      return true;
    }
    if (f.photo === 'pair' && ctx.photoCount < 2) return false;
    if (f.photo === 'required' && images < 1) return false;
    return true;
  });
}

/**
 * Content stripped to what this format is actually allowed to show.
 *
 * `contentSatisfiesFormat` asks whether a format has ENOUGH content. Nothing
 * asked whether the content BELONGED to it, so every field the model returned
 * was rendered whatever the format was — and that is a straight route around
 * the data gates elsewhere in this file.
 *
 * Observed live: a `meet the artist` post rendered with a `quote` block, i.e.
 * a fabricated client testimonial attributed to a real studio's customer. The
 * `testimonial` format is withheld unless the technician supplies a real
 * review for exactly that reason; a block that ignores the format walks
 * straight past it. The same hole let `rows` put invented prices on a format
 * that was never gated on real offer details.
 *
 * So the format's declared blocks are the whitelist, and anything else is
 * dropped rather than drawn.
 */
export function contentForFormat(id: PostFormatId, content: FormatContent | undefined): FormatContent | undefined {
  if (!content) return undefined;
  const allowed = new Set<BlockKind>(POST_FORMATS[id].blocks);
  const out: FormatContent = {};
  if (allowed.has('steps') && content.steps?.length) out.steps = content.steps;
  if (allowed.has('rows') && content.rows?.length) out.rows = content.rows;
  if (allowed.has('checklist') && content.checklist?.length) out.checklist = content.checklist;
  if (allowed.has('quote') && content.quote?.text) out.quote = content.quote;
  if (allowed.has('badge') && content.badge) out.badge = content.badge;
  // Not a block — the labels drawn on the two halves of a comparison, which
  // only a genuine before/after post has.
  if (id === 'proof' && content.compareLabels) out.compareLabels = content.compareLabels;
  return Object.keys(out).length ? out : undefined;
}

/** Content fields a format needs before it can render. Used to reject a format the model under-filled. */
export function contentSatisfiesFormat(id: PostFormatId, content: FormatContent | undefined): boolean {
  const fmt = POST_FORMATS[id];
  if (!fmt.blocks.length) return true;
  // 'badge' alone is decorative — a format whose only block is a badge still
  // works without it, so don't fail the whole format over a missing chip.
  const required = fmt.blocks.filter((b) => b !== 'badge');
  if (!required.length) return true;
  return required.some((b) => {
    switch (b) {
      case 'steps': return !!content?.steps?.length;
      case 'rows': return !!content?.rows?.length;
      case 'checklist': return !!content?.checklist?.length;
      case 'quote': return !!content?.quote?.text;
      default: return false;
    }
  });
}

// ── Locale, hemisphere and occasions ─────────────────────────────────────
// Derived from the Tenant.locale / Tenant.timezone that already exist
// (schema.prisma), so multi-country support needs no schema change.

export type MarketContext = {
  country: string;
  hemisphere: 'north' | 'south';
  season: 'summer' | 'autumn' | 'winter' | 'spring';
  month: string;
  occasions: string[];
};

export function countryFromLocale(locale: string | null | undefined): string {
  const m = /[-_]([A-Za-z]{2})$/.exec((locale || '').trim());
  return m ? m[1].toUpperCase() : 'AU';
}

/**
 * Countries whose populated regions sit south of the equator. Everything
 * else resolves north. This is the fix for the season bug: a "summer glow"
 * campaign in July is correct in London and nonsense in Sydney, and the
 * system would previously have generated the London version for both.
 */
const SOUTHERN = new Set(['AU', 'NZ', 'ZA', 'AR', 'CL', 'UY', 'PY', 'PE', 'BO', 'ZW', 'NA', 'BW', 'MZ', 'ID', 'FJ', 'PG']);

/** Brazil straddles the equator but its population centres are southern. */
const SOUTHERN_MAJORITY = new Set(['BR']);

export function hemisphereFor(country: string): 'north' | 'south' {
  return SOUTHERN.has(country) || SOUTHERN_MAJORITY.has(country) ? 'south' : 'north';
}

export function seasonFor(month: number, hemisphere: 'north' | 'south'): MarketContext['season'] {
  // month is 1-12
  const northern: MarketContext['season'][] = [
    'winter', 'winter', 'spring', 'spring', 'spring', 'summer',
    'summer', 'summer', 'autumn', 'autumn', 'autumn', 'winter',
  ];
  const idx = Math.min(11, Math.max(0, month - 1));
  const n = northern[idx];
  if (hemisphere === 'north') return n;
  return n === 'winter' ? 'summer' : n === 'summer' ? 'winter' : n === 'spring' ? 'autumn' : 'spring';
}

/**
 * Celebrations a studio in this market plausibly observes, near this month.
 *
 * Names only, never dates. Many of these are movable (lunar or liturgical)
 * and asserting a specific date would eventually publish a wrong one — the
 * copy refers to the occasion, and the studio supplies any date itself.
 */
const OCCASIONS_BY_COUNTRY: Record<string, Partial<Record<number, string[]>>> = {
  IN: {
    1: ['Makar Sankranti', 'Pongal'], 2: ['Valentine\'s Day'], 3: ['Holi'],
    4: ['Baisakhi', 'wedding season'], 8: ['Raksha Bandhan', 'Onam'],
    9: ['Ganesh Chaturthi'], 10: ['Navratri', 'Karva Chauth', 'Diwali'],
    11: ['Diwali', 'wedding season'], 12: ['Christmas', 'New Year'],
  },
  AE: {
    2: ['Valentine\'s Day'], 3: ['Ramadan'], 4: ['Eid al-Fitr'],
    6: ['Eid al-Adha'], 12: ['UAE National Day', 'New Year'],
  },
  US: {
    2: ['Valentine\'s Day'], 5: ['Mother\'s Day', 'prom season', 'graduation'],
    6: ['wedding season', 'Father\'s Day'], 10: ['Halloween'],
    11: ['Thanksgiving', 'Black Friday'], 12: ['Christmas', 'New Year\'s Eve'],
  },
  GB: {
    2: ['Valentine\'s Day'], 3: ['Mothering Sunday'], 6: ['wedding season'],
    10: ['Halloween'], 11: ['Black Friday'], 12: ['Christmas', 'New Year\'s Eve'],
  },
  AU: {
    2: ['Valentine\'s Day'], 5: ['Mother\'s Day'], 9: ['Father\'s Day', 'spring racing'],
    11: ['Melbourne Cup', 'Black Friday', 'wedding season'], 12: ['Christmas', 'New Year\'s Eve'],
  },
  BR: {
    2: ['Carnival'], 5: ['Dia das Mães'], 6: ['Festa Junina'],
    12: ['Christmas', 'Réveillon'],
  },
  SG: {
    1: ['Lunar New Year'], 2: ['Lunar New Year'], 4: ['Hari Raya'],
    10: ['Deepavali'], 12: ['Christmas', 'New Year'],
  },
};

/** Occasions every market shares, so a country with no table still gets sensible options. */
const UNIVERSAL: Partial<Record<number, string[]>> = {
  1: ['New Year, new look'], 2: ['Valentine\'s Day'], 12: ['Christmas', 'New Year\'s Eve'],
};

/**
 * Timezone → country. This exists because of what the data actually shows:
 * every tenant in this deployment has the schema-default locale `en-AU`,
 * including studios whose timezone is Asia/Calcutta. Trusting locale alone
 * would tell an Indian studio it is in the southern hemisphere and offer it
 * Melbourne Cup instead of Diwali.
 *
 * `timezone` is the field people actually set, so it wins whenever it says
 * anything real.
 */
const TZ_COUNTRY: Array<[string, string]> = [
  ['Asia/Calcutta', 'IN'], ['Asia/Kolkata', 'IN'],
  ['Asia/Dubai', 'AE'], ['Asia/Riyadh', 'SA'],
  ['Asia/Singapore', 'SG'], ['Asia/Kuala_Lumpur', 'MY'],
  ['Asia/Karachi', 'PK'], ['Asia/Dhaka', 'BD'],
  ['Australia/', 'AU'], ['Pacific/Auckland', 'NZ'],
  ['Europe/London', 'GB'], ['Europe/Dublin', 'IE'],
  ['America/Toronto', 'CA'], ['America/Vancouver', 'CA'], ['America/Edmonton', 'CA'],
  ['America/Sao_Paulo', 'BR'], ['America/Fortaleza', 'BR'],
  ['Africa/Johannesburg', 'ZA'],
  ['America/', 'US'],
];

export function countryFromTimezone(timezone: string | null | undefined): string | null {
  const tz = (timezone || '').trim();
  if (!tz || tz === 'UTC' || tz === 'Etc/UTC') return null;
  for (const [prefix, country] of TZ_COUNTRY) {
    if (tz === prefix || tz.startsWith(prefix)) return country;
  }
  return null;
}

export function marketContext(
  locale: string | null | undefined,
  timezone?: string | null,
  now = new Date(),
): MarketContext {
  const country = countryFromTimezone(timezone) ?? countryFromLocale(locale);
  const hemisphere = hemisphereFor(country);
  const month = now.getMonth() + 1;
  const table = OCCASIONS_BY_COUNTRY[country];
  // This month and the next — studios plan ahead, and a Diwali post published
  // on the day is already late.
  const nextMonth = (month % 12) + 1;
  const pick = (m: number) => [...(table?.[m] ?? []), ...(UNIVERSAL[m] ?? [])];
  const occasions = Array.from(new Set([...pick(month), ...pick(nextMonth)]));
  return {
    country,
    hemisphere,
    season: seasonFor(month, hemisphere),
    month: now.toLocaleString('en', { month: 'long' }),
    occasions,
  };
}

/** One line of market grounding for the creative-director prompt. */
export function describeMarket(m: MarketContext): string {
  const occ = m.occasions.length ? ` Celebrations this studio's community may be marking soon: ${m.occasions.join(', ')}.` : '';
  return `The studio is in ${m.country} (${m.hemisphere}ern hemisphere). It is ${m.month}, which is ${m.season} there — never assume a northern-hemisphere calendar.${occ}`;
}
