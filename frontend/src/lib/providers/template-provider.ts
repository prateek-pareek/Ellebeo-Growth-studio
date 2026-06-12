export type Template = {
  id: string;
  name: string;
  type: string;       // Carousel | Reel | Story | Caption | TikTok
  pillar: string;     // Transformations | Education | Behind the chair | Client stories
  categories: string[];
  preview: string;
  description: string;
  goal: string;       // maps to generate page goal
};

export type UseTemplatesResult = {
  templates: Template[];
  categories: string[];
  loading: boolean;
  error: boolean;
};

export const STATIC_TEMPLATES: Template[] = [
  {
    id: "colour-transformation",
    name: "Before & after — colour transformation",
    type: "Carousel",
    pillar: "Transformations",
    categories: ["Hairdresser", "Colourist"],
    preview: "https://images.unsplash.com/photo-1560869713-7d0a29430803?w=800&h=1000&fit=crop",
    description: "3 slides: starting hair, the technique, the reveal. Caption fills from your appointment notes.",
    goal: "showcase",
  },
  {
    id: "bridal-trial-reveal",
    name: "Bridal trial reveal",
    type: "Carousel",
    pillar: "Transformations",
    categories: ["Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=1000&fit=crop",
    description: "Soft pre/post + a close-up of the eye look. Built around natural light photography.",
    goal: "showcase",
  },
  {
    id: "lash-mapping-explainer",
    name: "Lash mapping explainer",
    type: "Carousel",
    pillar: "Education",
    categories: ["Lash & Brow"],
    preview: "https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=800&h=1000&fit=crop",
    description: "3 slides on how you map a set, what it does for the eye shape, and aftercare basics.",
    goal: "educate",
  },
  {
    id: "nail-closeup-reel",
    name: "Nail set close-up reel",
    type: "Reel",
    pillar: "Transformations",
    categories: ["Nail Artist"],
    preview: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=1000&fit=crop",
    description: "15-second slow pan over the finished set with hand styling.",
    goal: "showcase",
  },
  {
    id: "treatment-explainer",
    name: "Treatment explainer — what to expect",
    type: "Carousel",
    pillar: "Education",
    categories: ["Injector", "Skin Therapist"],
    preview: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&h=1000&fit=crop",
    description: "Honest, calm walk-through of a service for first-time clients.",
    goal: "educate",
  },
  {
    id: "barber-transformation-reel",
    name: "Barber transformation reel",
    type: "Reel",
    pillar: "Transformations",
    categories: ["Barber"],
    preview: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=1000&fit=crop",
    description: "Cut from before, fade in progress, beard sculpt, and the finish.",
    goal: "showcase",
  },
  {
    id: "client-testimonial-quote",
    name: "Client testimonial quote card",
    type: "Carousel",
    pillar: "Client stories",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&h=1000&fit=crop",
    description: "Pull a sentence from a review, set on linen background.",
    goal: "trust",
  },
  {
    id: "studio-morning-story",
    name: "Studio morning — story sequence",
    type: "Story",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=1000&fit=crop",
    description: "Four vertical stories: space, tools, hands working, the finished blow-out.",
    goal: "trust",
  },
  {
    id: "fill-the-week-promo",
    name: "Fill-the-week promotion",
    type: "Reel",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&h=1000&fit=crop",
    description: "20-second reel promoting open slots this week.",
    goal: "availability",
  },
  {
    id: "skin-glow-reveal",
    name: "Skin glow — before & after",
    type: "Carousel",
    pillar: "Transformations",
    categories: ["Skin Therapist"],
    preview: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&h=1000&fit=crop",
    description: "Side-by-side skin comparison with treatment breakdown. Clean, clinical aesthetic.",
    goal: "showcase",
  },
  {
    id: "aftercare-tips-carousel",
    name: "Aftercare tips — keep the result",
    type: "Carousel",
    pillar: "Education",
    categories: ["Hairdresser", "Colourist", "Skin Therapist"],
    preview: "https://images.unsplash.com/photo-1519415943484-9fa1873496d4?w=800&h=1000&fit=crop",
    description: "5 quick tips clients can follow at home to extend their results.",
    goal: "educate",
  },
  {
    id: "brow-shaping-tutorial",
    name: "Brow shaping — behind the process",
    type: "Reel",
    pillar: "Behind the chair",
    categories: ["Lash & Brow"],
    preview: "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop",
    description: "Close-up reel showing the mapping, wax, and final shape with commentary.",
    goal: "educate",
  },

  // ── Story templates ──────────────────────────────────────────────────────
  {
    id: "story-transformation-reveal",
    name: "4-frame transformation reveal",
    type: "Story",
    pillar: "Transformations",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1487412947147-5cebf100ffc2?w=800&h=1000&fit=crop",
    description: "Frame 1: before. Frame 2: in progress. Frame 3: close-up detail. Frame 4: full reveal with CTA.",
    goal: "showcase",
  },
  {
    id: "story-behind-the-scenes",
    name: "Behind the scenes — studio day",
    type: "Story",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Barber"],
    preview: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=1000&fit=crop",
    description: "Candid 4-frame story of your day. Tools, client moment, in-progress shot, finished result.",
    goal: "trust",
  },
  {
    id: "story-quick-tip",
    name: "Quick tip — 4-slide education",
    type: "Story",
    pillar: "Education",
    categories: ["Skin Therapist", "Hairdresser", "Colourist", "Lash & Brow"],
    preview: "https://images.unsplash.com/photo-1570172619644-dfd03ed5d881?w=800&h=1000&fit=crop",
    description: "One tip broken into 4 digestible frames. Text overlay on each, swipe-through format.",
    goal: "educate",
  },
  {
    id: "story-availability-poll",
    name: "Slots open — poll story",
    type: "Story",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Lash & Brow", "Injector", "Barber"],
    preview: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&h=1000&fit=crop",
    description: "Frame 1: tease. Frame 2: available days. Frame 3: poll sticker. Frame 4: DM CTA.",
    goal: "availability",
  },
  {
    id: "story-client-feature",
    name: "Client feature story",
    type: "Story",
    pillar: "Client stories",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup", "Skin Therapist", "Nail Artist"],
    preview: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&h=1000&fit=crop",
    description: "Spotlight a client result across 4 frames — before, process note, result, and their quote.",
    goal: "trust",
  },

  // ── Caption templates ────────────────────────────────────────────────────
  {
    id: "caption-nail-reveal",
    name: "Single shot reveal — nails",
    type: "Caption",
    pillar: "Transformations",
    categories: ["Nail Artist"],
    preview: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=1000&fit=crop",
    description: "One hero photo of the finished set, caption built from client notes and your Brand DNA voice.",
    goal: "showcase",
  },
  {
    id: "caption-honest-education",
    name: "Honest product switch — what changed",
    type: "Caption",
    pillar: "Education",
    categories: ["Skin Therapist", "Hairdresser", "Colourist"],
    preview: "https://images.unsplash.com/photo-1556228578-0d85b1a4d571?w=800&h=1000&fit=crop",
    description: "Single image post explaining why you switched a product or technique. Builds authority.",
    goal: "educate",
  },
  {
    id: "caption-availability-slots",
    name: "Open slots this week",
    type: "Caption",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Lash & Brow", "Skin Therapist", "Barber"],
    preview: "https://images.unsplash.com/photo-1522337360788-8b13dee7a37e?w=800&h=1000&fit=crop",
    description: "Quick availability post with a direct booking CTA. Written in your tone with urgency.",
    goal: "availability",
  },
  {
    id: "caption-client-love",
    name: "Client love note",
    type: "Caption",
    pillar: "Client stories",
    categories: ["Hairdresser", "Colourist", "Bridal Makeup", "Skin Therapist"],
    preview: "https://images.unsplash.com/photo-1508214751196-bcfd4ca60f91?w=800&h=1000&fit=crop",
    description: "Pull a line from a client review, pair with a result photo. Caption does the storytelling.",
    goal: "trust",
  },
  {
    id: "caption-booking-cta",
    name: "Book now — direct CTA post",
    type: "Caption",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Injector", "Barber"],
    preview: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=1000&fit=crop",
    description: "Single image with a punchy conversion caption. Drives traffic directly to your booking link.",
    goal: "convert",
  },

  // ── TikTok templates ─────────────────────────────────────────────────────
  {
    id: "tiktok-colour-transformation",
    name: "60-second colour reveal",
    type: "TikTok",
    pillar: "Transformations",
    categories: ["Hairdresser", "Colourist"],
    preview: "https://images.unsplash.com/photo-1560869713-7d0a29430803?w=800&h=1000&fit=crop",
    description: "Fast-cut before → process → reveal. Hook in the first 3 seconds, trending audio cue.",
    goal: "showcase",
  },
  {
    id: "tiktok-technique-explainer",
    name: "The technique nobody explains",
    type: "TikTok",
    pillar: "Education",
    categories: ["Hairdresser", "Colourist", "Lash & Brow", "Nail Artist", "Skin Therapist"],
    preview: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=800&h=1000&fit=crop",
    description: "Break down one technique in 30 seconds. Text overlays + voiceover script from your Brand DNA.",
    goal: "educate",
  },
  {
    id: "tiktok-day-in-the-life",
    name: "Day in the life — behind the chair",
    type: "TikTok",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Barber", "Bridal Makeup"],
    preview: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=800&h=1000&fit=crop",
    description: "Montage of your studio day — setup, clients, process, finish. Casual and authentic.",
    goal: "trust",
  },
  {
    id: "tiktok-slots-urgency",
    name: "Last few slots — urgency reel",
    type: "TikTok",
    pillar: "Behind the chair",
    categories: ["Hairdresser", "Colourist", "Nail Artist", "Lash & Brow", "Injector"],
    preview: "https://images.unsplash.com/photo-1519415943484-9fa1873496d4?w=800&h=1000&fit=crop",
    description: "Short punchy TikTok calling out remaining slots. Drives immediate DM or booking link taps.",
    goal: "availability",
  },
];

const ALL_CATEGORIES = Array.from(
  new Set(STATIC_TEMPLATES.flatMap((t) => t.categories))
).sort();

export function useTemplates(): UseTemplatesResult {
  return {
    templates: STATIC_TEMPLATES,
    categories: ALL_CATEGORIES,
    loading: false,
    error: false,
  };
}
