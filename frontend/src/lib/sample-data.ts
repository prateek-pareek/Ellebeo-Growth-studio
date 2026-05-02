// Sample data for Elle.Be.O Growth — practical entities used across the app.
// Designed to feel multi-category: hair, colour, bridal makeup, lash/brow, nails,
// injectors, skin therapy, barbering.

export const technician = {
  name: "Von Glass",
  firstName: "Von",
  handle: "@von__glass",
  niche: "Hair Colourist & Cut Specialist · Paris",
  category: "Colourist",
  city: "Paris 3e",
  yearsActive: 7,
  avatar: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=200&h=200&fit=crop&crop=faces",
};

// Categories supported by Elle.Be.O Growth.
export const categories = [
  "Hairdresser",
  "Colourist",
  "Bridal makeup",
  "Lash & brow",
  "Nail artist",
  "Injector",
  "Skin therapist",
  "Barber",
] as const;

export type Category = (typeof categories)[number];

// ---------- Brand DNA — the intelligence layer ----------

export const brandDNA = {
  ready: true,
  archetype: "Quiet Luxury Colourist",
  oneLiner:
    "Lived-in colour and precision cuts for women who want hair that grows out beautifully.",
  category: "Colourist" as Category,
  pillars: [
    { name: "Transformations", description: "Before-and-after results from real clients.", weight: 35 },
    { name: "Education", description: "Why a technique works and how to maintain it at home.", weight: 25 },
    { name: "Behind the chair", description: "The studio, the products, the process.", weight: 20 },
    { name: "Client stories", description: "Testimonials and journeys over multiple visits.", weight: 20 },
  ],
  voice: {
    summary: "Calm · Expert · Warm",
    do: [
      "Speak plainly and warmly",
      "Lead with the result the client felt",
      "Explain the why behind each technique",
    ],
    dont: ["No emojis or hype", "No discount-led captions", "No medical or unrealistic claims"],
  },
  palette: ["#8C7A70", "#E6D2CC", "#F7F5F2", "#8A9486", "#2F2F2F"],
  moodboard: [
    "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=600&h=750&fit=crop",
    "https://images.unsplash.com/photo-1560750588-73207b1ef5b8?w=600&h=750&fit=crop",
    "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&h=750&fit=crop",
    "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=750&fit=crop",
    "https://images.unsplash.com/photo-1580618672591-eb180b1a973f?w=600&h=750&fit=crop",
    "https://images.unsplash.com/photo-1503236823255-94609f598e71?w=600&h=750&fit=crop",
  ],
  idealClient: {
    age: "30–48",
    cities: "Paris · Antwerp · Copenhagen",
    looksFor: "A colourist who explains the maintenance and respects her time.",
  },
  goals: {
    bookingsPerWeek: 18,
    postsPerWeek: 4,
    focusServices: ["Lived-in balayage", "Signature cut", "Gloss refresh"],
  },
  // What Brand DNA powers across the product:
  powers: [
    "Caption tone and word choice",
    "Template recommendations",
    "Campaign goals and CTAs",
    "Calendar pacing and pillar mix",
    "Profile bio and service descriptions",
  ],
};

// ---------- Appointments (the source of content) ----------

export type Appointment = {
  id: string;
  clientName: string;
  service: string;
  category: Category;
  date: string;
  hasBefore: boolean;
  hasAfter: boolean;
  consent: "granted" | "pending" | "declined" | "not_requested";
  notes?: string;
  beforeImage?: string;
  afterImage?: string;
  contentReady: number;
};

export const appointments: Appointment[] = [
  {
    id: "a1",
    clientName: "Camille R.",
    service: "Lived-in balayage + gloss",
    category: "Colourist",
    date: "Today · 10:30",
    hasBefore: true,
    hasAfter: true,
    consent: "granted",
    notes: "First balayage. Soft face-framing, root smudge to hide regrowth. Loved it.",
    beforeImage: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&h=750&fit=crop",
    contentReady: 3,
  },
  {
    id: "a2",
    clientName: "Inès D.",
    service: "Bridal makeup trial",
    category: "Bridal makeup",
    date: "Today · 14:00",
    hasBefore: true,
    hasAfter: true,
    consent: "pending",
    notes: "Soft glam, dewy base, brown smoky eye. Wedding in 4 weeks.",
    beforeImage: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=600&h=750&fit=crop",
    contentReady: 0,
  },
  {
    id: "a3",
    clientName: "Margaux L.",
    service: "Russian volume lash set",
    category: "Lash & brow",
    date: "Yesterday · 16:30",
    hasBefore: true,
    hasAfter: true,
    consent: "granted",
    notes: "Natural mapping, opened the eye. Booked 3-week refill.",
    beforeImage: "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1583241800698-9c2e0c11d220?w=600&h=750&fit=crop",
    contentReady: 1,
  },
  {
    id: "a4",
    clientName: "Sofia A.",
    service: "Gel-X full set, almond shape",
    category: "Nail artist",
    date: "Yesterday · 11:00",
    hasBefore: false,
    hasAfter: true,
    consent: "granted",
    notes: "Chrome finish, neutral base. Great for short clip.",
    afterImage: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&h=750&fit=crop",
    contentReady: 2,
  },
  {
    id: "a5",
    clientName: "Élise V.",
    service: "Lip filler — 0.5ml",
    category: "Injector",
    date: "Mar 24 · 09:00",
    hasBefore: true,
    hasAfter: true,
    consent: "declined",
    notes: "Client prefers privacy. Do not use any imagery.",
    beforeImage: "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1503236823255-94609f598e71?w=600&h=750&fit=crop",
    contentReady: 0,
  },
  {
    id: "a6",
    clientName: "Hugo M.",
    service: "Skin fade + beard sculpt",
    category: "Barber",
    date: "Mar 23 · 18:15",
    hasBefore: true,
    hasAfter: true,
    consent: "granted",
    notes: "Sharp 1-fade, defined beard line. Strong before/after.",
    beforeImage: "https://images.unsplash.com/photo-1503951914875-452162b0f3f1?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600&h=750&fit=crop",
    contentReady: 1,
  },
  {
    id: "a7",
    clientName: "Naïma B.",
    service: "Brow lamination + tint",
    category: "Lash & brow",
    date: "Mar 22 · 11:30",
    hasBefore: true,
    hasAfter: true,
    consent: "not_requested",
    notes: "Lifted, fluffy brows. Ask permission before posting.",
    beforeImage: "https://images.unsplash.com/photo-1582095133179-bfd08e2fc6b3?w=600&h=750&fit=crop",
    afterImage: "https://images.unsplash.com/photo-1526045478516-99145907023c?w=600&h=750&fit=crop",
    contentReady: 0,
  },
];

export const consentSummary = {
  granted: appointments.filter((a) => a.consent === "granted").length,
  pending: appointments.filter((a) => a.consent === "pending").length,
  missing: appointments.filter((a) => a.consent === "not_requested").length,
};

// ---------- Content drafts ----------

export type ContentState = "draft" | "scheduled" | "posted" | "blocked";
export type ContentGoal = "showcase" | "educate" | "convert" | "availability" | "trust";
export type ContentChannel = "Instagram" | "TikTok" | "Facebook";

export type ContentItem = {
  id: string;
  title: string;
  type: "Reel" | "Carousel" | "Story" | "Caption" | "TikTok";
  pillar: string;
  category: Category;
  // Legacy review-queue status — kept for backward compatibility with other surfaces.
  status: "Needs review" | "Approved" | "Scheduled" | "Published" | "Needs consent";
  // Normalized lifecycle state — drives /content filters and cards.
  state: ContentState;
  goal: ContentGoal;
  image: string;
  caption: string;
  cta: string;
  hashtags: string[];
  channel?: ContentChannel;
  scheduledFor?: string;
  postedAt?: string;
  qualityScore?: number;
  sourceAppointmentId?: string;
  consentRequestId?: string;
  updatedAt: string;
};

export const contentLibrary: ContentItem[] = [
  {
    id: "c1",
    title: "Camille — first balayage, soft and lived-in",
    type: "Carousel",
    pillar: "Transformations",
    category: "Colourist",
    status: "Needs review",
    state: "draft",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=800&h=1000&fit=crop",
    caption:
      "Camille's first balayage. We kept the depth at the root so regrowth blends, and softened the face frame. The kind of colour you can leave alone for four months.",
    cta: "Book a colour consultation",
    hashtags: ["#balayage", "#parishair", "#beforeafter", "#colourist", "#softblonde"],
    qualityScore: 92,
    sourceAppointmentId: "a1",
    consentRequestId: "cr-a1",
    updatedAt: "2h ago",
  },
  {
    id: "c2",
    title: "How often should you really refresh balayage?",
    type: "Carousel",
    pillar: "Education",
    category: "Colourist",
    status: "Needs review",
    state: "draft",
    goal: "educate",
    image: "https://images.unsplash.com/photo-1560066984-138dadb4c035?w=800&h=1000&fit=crop",
    caption:
      "Three slides on what actually fades, what doesn't, and the only two products you need at home between appointments.",
    cta: "Book a gloss refresh",
    hashtags: ["#hairtips", "#balayagecare", "#aftercare", "#colourist"],
    qualityScore: 88,
    updatedAt: "Yesterday",
  },
  {
    id: "c3",
    title: "Camille's reaction — short reel",
    type: "Reel",
    pillar: "Transformations",
    category: "Colourist",
    status: "Approved",
    state: "scheduled",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1605497788044-5a32c7078486?w=800&h=1000&fit=crop",
    caption: "20-second reel: before, the painting process, the reveal. Soft music, no voiceover.",
    cta: "Reserve your colour appointment",
    hashtags: ["#balayagereveal", "#parishair", "#hairtransformation"],
    channel: "Instagram",
    scheduledFor: "Wed · 18:30",
    qualityScore: 94,
    sourceAppointmentId: "a1",
    consentRequestId: "cr-a1",
    updatedAt: "1h ago",
  },
  {
    id: "c4",
    title: "Inside the studio · Tuesday morning",
    type: "Story",
    pillar: "Behind the chair",
    category: "Colourist",
    status: "Scheduled",
    state: "scheduled",
    goal: "trust",
    image: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=800&h=1000&fit=crop",
    caption: "Four-frame story: the chair, the foils, hands working, the finished blow-out.",
    cta: "Walk through the studio",
    hashtags: ["#behindthechair", "#parisstudio"],
    channel: "Instagram",
    scheduledFor: "Wed · 09:00",
    qualityScore: 81,
    updatedAt: "3d ago",
  },
  {
    id: "c5",
    title: "Margaux — Russian volume set",
    type: "Carousel",
    pillar: "Transformations",
    category: "Lash & brow",
    status: "Needs review",
    state: "draft",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1583241800698-9c2e0c11d220?w=800&h=1000&fit=crop",
    caption: "Natural mapping designed to open the eye, not weigh it down. Lasts 3 weeks before a refill.",
    cta: "Book a lash consultation",
    hashtags: ["#russianvolume", "#lashartist", "#parislashes"],
    qualityScore: 90,
    sourceAppointmentId: "a3",
    consentRequestId: "cr-a3",
    updatedAt: "4h ago",
  },
  {
    id: "c6",
    title: "Hugo — skin fade and beard sculpt",
    type: "Reel",
    pillar: "Transformations",
    category: "Barber",
    status: "Needs consent",
    state: "blocked",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=800&h=1000&fit=crop",
    caption: "Sharp 1-fade, defined beard line, finished with a hot towel. 30-second cut.",
    cta: "Book a fade",
    hashtags: ["#barberparis", "#skinfade", "#beardsculpt"],
    qualityScore: 86,
    sourceAppointmentId: "a6",
    consentRequestId: "cr-a6",
    updatedAt: "Yesterday",
  },
  {
    id: "c7",
    title: "Sofia's almond Gel-X with chrome",
    type: "Caption",
    pillar: "Transformations",
    category: "Nail artist",
    status: "Approved",
    state: "scheduled",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=800&h=1000&fit=crop",
    caption: "Almond Gel-X, neutral base, soft chrome on top. Two-week wear without lifting.",
    cta: "Book a nail set",
    hashtags: ["#gelx", "#nailartist", "#chromenails", "#parisnails"],
    channel: "Instagram",
    scheduledFor: "Fri · 17:00",
    qualityScore: 89,
    sourceAppointmentId: "a4",
    consentRequestId: "cr-a4",
    updatedAt: "2d ago",
  },
  {
    id: "c8",
    title: "Fill quiet Tuesdays — March promo",
    type: "TikTok",
    pillar: "Behind the chair",
    category: "Colourist",
    status: "Needs review",
    state: "draft",
    goal: "availability",
    image: "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=800&h=1000&fit=crop",
    caption: "30-second TikTok promoting Tuesday colour slots in March. Calm pace, no jump cuts.",
    cta: "Book a Tuesday slot",
    hashtags: ["#tuesdayslots", "#parishair", "#colourpromo"],
    qualityScore: 78,
    updatedAt: "5h ago",
  },
  {
    id: "c9",
    title: "Camille's balayage reveal — published",
    type: "Carousel",
    pillar: "Transformations",
    category: "Colourist",
    status: "Published",
    state: "posted",
    goal: "showcase",
    image: "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?w=800&h=1000&fit=crop",
    caption:
      "The reveal post that drove 14 saves and 3 booking DMs in 24 hours. Soft golden balayage, lived-in finish.",
    cta: "Book your balayage",
    hashtags: ["#balayage", "#parishair", "#beforeafter"],
    channel: "Instagram",
    postedAt: "Mon · 18:30",
    qualityScore: 95,
    sourceAppointmentId: "a1",
    consentRequestId: "cr-a1",
    updatedAt: "1w ago",
  },
  {
    id: "c10",
    title: "Gloss vs. toner — what your colourist actually means",
    type: "Caption",
    pillar: "Education",
    category: "Colourist",
    status: "Published",
    state: "posted",
    goal: "educate",
    image: "https://images.unsplash.com/photo-1559599101-f09722fb4948?w=800&h=1000&fit=crop",
    caption:
      "Quick explainer on the difference, when each one is right, and why your salon may default to gloss in winter.",
    cta: "Book a colour consultation",
    hashtags: ["#hairtips", "#colourtheory", "#salonlife"],
    channel: "Instagram",
    postedAt: "Sat · 10:00",
    qualityScore: 84,
    updatedAt: "1w ago",
  },
];

// ---------- Calendar ----------

export type CalendarEntry = {
  date: number;
  month: string;
  weekday: string;
  title?: string;
  type?: ContentItem["type"];
  status?: "scheduled" | "draft" | "published" | "rest";
  pillar?: string;
};

export const calendarMonth = "March 2026";

export const calendarEntries: CalendarEntry[] = [
  { date: 2, month: "March", weekday: "Mon", title: "Camille — balayage reveal", type: "Carousel", status: "scheduled", pillar: "Transformations" },
  { date: 3, month: "March", weekday: "Tue", status: "rest" },
  { date: 4, month: "March", weekday: "Wed", title: "Balayage maintenance 101", type: "Carousel", status: "draft", pillar: "Education" },
  { date: 5, month: "March", weekday: "Thu", title: "Inside the studio", type: "Story", status: "scheduled", pillar: "Behind the chair" },
  { date: 6, month: "March", weekday: "Fri", title: "Sofia's chrome nails", type: "Caption", status: "scheduled", pillar: "Transformations" },
  { date: 7, month: "March", weekday: "Sat", title: "Camille's reaction reel", type: "Reel", status: "scheduled", pillar: "Transformations" },
  { date: 8, month: "March", weekday: "Sun", status: "rest" },
  { date: 9, month: "March", weekday: "Mon", title: "Tuesday colour promo", type: "TikTok", status: "draft", pillar: "Behind the chair" },
  { date: 10, month: "March", weekday: "Tue", status: "rest" },
  { date: 11, month: "March", weekday: "Wed", title: "Margaux's lash set", type: "Carousel", status: "draft", pillar: "Transformations" },
  { date: 12, month: "March", weekday: "Thu", title: "Gloss vs. toner explained", type: "Carousel", status: "draft", pillar: "Education" },
  { date: 13, month: "March", weekday: "Fri", status: "rest" },
  { date: 14, month: "March", weekday: "Sat", title: "Hugo — skin fade reel", type: "Reel", status: "scheduled", pillar: "Transformations" },
  { date: 15, month: "March", weekday: "Sun", status: "rest" },
];

// ---------- Campaigns ----------

export type Campaign = {
  id: string;
  name: string;
  goal: string;
  window: string;
  posts: number;
  status: "Active" | "Planning" | "Done";
  progress: number;
  category?: Category;
};

export const campaigns: Campaign[] = [
  {
    id: "k1",
    name: "Fill quiet Tuesdays — March",
    goal: "Add 6 colour bookings on Tue + Wed",
    window: "Mar 9 — Mar 21",
    posts: 6,
    status: "Active",
    progress: 0.5,
    category: "Colourist",
  },
  {
    id: "k2",
    name: "Bridal season — spring weddings",
    goal: "Book 5 trial appointments before May",
    window: "Mar 1 — Apr 30",
    posts: 9,
    status: "Planning",
    progress: 0.2,
    category: "Bridal makeup",
  },
  {
    id: "k3",
    name: "Lash refill reactivation",
    goal: "Bring back clients overdue for a refill",
    window: "Mar 4 — Mar 28",
    posts: 4,
    status: "Active",
    progress: 0.4,
    category: "Lash & brow",
  },
];

// ---------- Templates ----------

export type Template = {
  id: string;
  name: string;
  type: ContentItem["type"];
  pillar: string;
  description: string;
  preview: string;
  categories: Category[]; // which technician categories this fits
};

export const templates: Template[] = [
  {
    id: "t1",
    name: "Before & after — colour transformation",
    type: "Carousel",
    pillar: "Transformations",
    description: "3 slides: starting hair, the technique, the reveal. Caption fills from your appointment notes.",
    preview: "https://images.unsplash.com/photo-1595476108010-b4d1f102b1b1?w=600&h=750&fit=crop",
    categories: ["Hairdresser", "Colourist"],
  },
  {
    id: "t2",
    name: "Bridal trial reveal",
    type: "Carousel",
    pillar: "Transformations",
    description: "Soft pre/post + a close-up of the eye look. Built around natural light photography.",
    preview: "https://images.unsplash.com/photo-1596755389378-c31d21fd1273?w=600&h=750&fit=crop",
    categories: ["Bridal makeup"],
  },
  {
    id: "t3",
    name: "Lash mapping explainer",
    type: "Carousel",
    pillar: "Education",
    description: "3 slides on how you map a set, what it does for the eye shape, and aftercare basics.",
    preview: "https://images.unsplash.com/photo-1583241800698-9c2e0c11d220?w=600&h=750&fit=crop",
    categories: ["Lash & brow"],
  },
  {
    id: "t4",
    name: "Nail set close-up reel",
    type: "Reel",
    pillar: "Transformations",
    description: "15-second slow pan over the finished set with hand styling.",
    preview: "https://images.unsplash.com/photo-1604654894610-df63bc536371?w=600&h=750&fit=crop",
    categories: ["Nail artist"],
  },
  {
    id: "t5",
    name: "Treatment explainer — what to expect",
    type: "Carousel",
    pillar: "Education",
    description: "Honest, calm walk-through of a service for first-time clients.",
    preview: "https://images.unsplash.com/photo-1556228578-8c89e6adf883?w=600&h=750&fit=crop",
    categories: ["Injector", "Skin therapist"],
  },
  {
    id: "t6",
    name: "Barber transformation reel",
    type: "Reel",
    pillar: "Transformations",
    description: "Cut from before, fade in progress, beard sculpt, and the finish.",
    preview: "https://images.unsplash.com/photo-1622286342621-4bd786c2447c?w=600&h=750&fit=crop",
    categories: ["Barber"],
  },
  {
    id: "t7",
    name: "Client testimonial quote card",
    type: "Carousel",
    pillar: "Client stories",
    description: "Pull a sentence from a review, set on linen background.",
    preview: "https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?w=600&h=750&fit=crop",
    categories: ["Hairdresser", "Colourist", "Bridal makeup", "Lash & brow", "Nail artist", "Injector", "Skin therapist", "Barber"],
  },
  {
    id: "t8",
    name: "Studio morning — story sequence",
    type: "Story",
    pillar: "Behind the chair",
    description: "Four vertical stories: space, tools, hands, finish.",
    preview: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?w=600&h=750&fit=crop",
    categories: ["Hairdresser", "Colourist", "Bridal makeup", "Lash & brow", "Nail artist", "Injector", "Skin therapist", "Barber"],
  },
  {
    id: "t9",
    name: "Fill-the-week promotion",
    type: "Reel",
    pillar: "Behind the chair",
    description: "20-second reel promoting open slots this week.",
    preview: "https://images.unsplash.com/photo-1522335789203-aaa1f9436cae?w=600&h=750&fit=crop",
    categories: ["Hairdresser", "Colourist", "Bridal makeup", "Lash & brow", "Nail artist", "Injector", "Skin therapist", "Barber"],
  },
];

// ---------- Profile (Elle.Be.O marketplace profile optimisation) ----------

export const profile = {
  completion: 78,
  bioStrength: "Strong",
  servicesListed: 6,
  servicesRecommended: 8,
  photosCount: 12,
  photosRecommended: 18,
  reviewsCount: 47,
  averageRating: 4.9,
  responseTimeHours: 3,
  suggestions: [
    { label: "Add 2 photos for the lived-in balayage service", impact: "High" },
    { label: "Shorten your bio intro to 2 sentences", impact: "Medium" },
    { label: "List the new gloss refresh as a standalone service", impact: "High" },
    { label: "Reply to 3 reviews from last month", impact: "Low" },
  ],
};

// ---------- Insights ----------

export const insights = {
  postsReadyForReview: 4,
  consentPending: 1,
  bookingsThisWeek: 14,
  bookingsTarget: 18,
  scheduledThisWeek: 5,
  topPillar: "Transformations",
};
