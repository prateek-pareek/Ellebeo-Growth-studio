export type LogoPosition = "bottom_right" | "bottom_left" | "top_right" | "top_left";
export type DraftStatus = "draft" | "published";

export type Foundations = {
  professional_name: string;
  category: string;
  categories: string[];
  niche: string;
  location: string;
  service_area: string;
  known_for: string;
  what_makes_different: string;
  reputation_asset: string;
};

export type ImageEnergy =
  | "still_quiet" | "calm_warm" | "confident_editorial"
  | "energetic_bright" | "soft_clinical" | "contemporary_cool";

export type Essence = {
  one_sentence: string;
  world_anchor: string;
  image_energy: ImageEnergy | "";
};

export type Palette = {
  primary: string; secondary: string; background: string; accent: string; depth: string;
};

export type VisualStyleCard =
  | "quiet_luxury" | "editorial_beauty" | "clinical_minimalist" | "warm_wellness"
  | "contemporary_cool" | "soft_feminine" | "bold_campaign" | "natural_organic"
  | "high_fashion" | "polished_commercial";

export type VisualIdentity = {
  palette: Palette;
  colours_to_avoid: string;
  logo_usage_rules: string;
  style_ranking: VisualStyleCard[];
  never_look_like: string;
};

export type ImageDirection = {
  lighting: string[];
  composition: string[];
  environments: string[];
  environments_other: string;
  textures: string[];
  people: string;
  realism: string;
};

export type OutputFormats = {
  platforms: string[];
  aspect_ratios: string[];
  safe_zone_rule: string;
  safe_zone_preset: string;
  finish: string[];
};

export type Typography = {
  personality: string;
  heading_font: string;
  body_font: string;
  case_rule: string;
  text_placement: string;
};

export type EmojiUsage = "none" | "minimal" | "moderate" | "expressive";
export type CaptionLength = "short" | "medium" | "long";

export type VoiceV2 = {
  three_words: string;
  perception: string;
  proof: string;
  vocabulary: string;
  caption_style: string;
  emoji_usage: EmojiUsage | "";
  caption_length: CaptionLength | "";
};

export type WrittenConventions = {
  spelling_variant: string;
  punctuation_rules: string;
  always_write: string;
  avoid_phrases: string[];
};

export type MarketTier = "luxury" | "mainstream" | "accessible";

export type Commercial = {
  hero_service: string;
  desired_outcome: string;
  secondary_services_text: string;
  proof_points: string;
  market_tier: MarketTier | "";
  content_objectives: string[];
  cta_style: string;
};

export type IdealClientV2 = {
  summary: string;
  age_range: string;
  audience_gender: string;
  lifestyle: string;
  problem: string;
  feeling_after_booking: string;
  buying_motivation: string;
  fears_objections: string;
  trust_signals: string;
  pays_more_for: string;
  visual_taste: string;
  client_language: string;
  language_to_avoid: string;
};

export type ContentStrategy = {
  pillars_ranked: string[];
  output_formats: string[];
  pillar_notes: string;
  targets: { bookings_per_week: string; posts_per_week: string };
};

export type Compliance = {
  client_consent_status: string;
  before_after_rules: string;
  claims_to_avoid: string;
  do_not_invent: string;
  product_ip_accuracy: string;
  hand_detail_handling: string;
  text_legibility_alt: string;
  regulated_ack: boolean;
  medical_aesthetics_practitioner: boolean;
};

export type SignatureSystem = {
  recurring_motif: string;
  framing_habit: string;
  colour_discipline: string;
  type_rule: string;
  finish: string;
  light_signature: string;
  always_absent: string;
};

export type MoodboardUsage =
  | "colour" | "mood" | "composition" | "texture" | "lighting"
  | "typography" | "overall" | "ref_only" | "private";

export type MoodboardRef = {
  id: string;
  storage_path: string;
  filename: string;
  usage: MoodboardUsage | "";
  notes: string;
  is_priority: boolean;
};

export type AssetType =
  | "headshot" | "work" | "space" | "tools" | "products"
  | "previous_posts" | "textures" | "behind_scenes";

export type AssetUsageRule =
  | "often" | "sometimes" | "ref_only" | "private_ref"
  | "do_not_generate" | "do_not_use_publicly";

export type AssetConsentStatus =
  | "owned" | "client_consented" | "third_party" | "pending" | "no_consent";

export type AssetLibraryItem = {
  id: string;
  storage_path: string;
  filename: string;
  asset_type: AssetType | "";
  usage_rule: AssetUsageRule | "";
  consent_status: AssetConsentStatus | "";
  notes: string;
};

export type BrandDnaRecord = {
  draft_status: DraftStatus;
  logo_position: LogoPosition | null;
  logo_asset_url: string | null;
  logo_storage_path: string | null;
  moodboard: MoodboardRef[];
  asset_library: AssetLibraryItem[];
  foundations: Foundations;
  essence: Essence;
  visual_identity: VisualIdentity;
  image_direction: ImageDirection;
  output_formats: OutputFormats;
  typography: Typography;
  voice_v2: VoiceV2;
  written_conventions: WrittenConventions;
  commercial: Commercial;
  ideal_client_v2: IdealClientV2;
  content_strategy: ContentStrategy;
  compliance: Compliance;
  signature_system: SignatureSystem;
};

export const EMPTY_BRAND_DNA: BrandDnaRecord = {
  draft_status: "draft",
  logo_position: null,
  logo_asset_url: null,
  logo_storage_path: null,
  moodboard: [],
  asset_library: [],
  foundations: { professional_name: "", category: "", categories: [], niche: "", location: "", service_area: "", known_for: "", what_makes_different: "", reputation_asset: "" },
  essence: { one_sentence: "", world_anchor: "", image_energy: "" },
  visual_identity: { palette: { primary: "", secondary: "", background: "", accent: "", depth: "" }, colours_to_avoid: "", logo_usage_rules: "", style_ranking: [], never_look_like: "" },
  image_direction: { lighting: [], composition: [], environments: [], environments_other: "", textures: [], people: "", realism: "" },
  output_formats: { platforms: [], aspect_ratios: [], safe_zone_rule: "", safe_zone_preset: "", finish: [] },
  typography: { personality: "", heading_font: "", body_font: "", case_rule: "", text_placement: "" },
  voice_v2: { three_words: "", perception: "", proof: "", vocabulary: "", caption_style: "", emoji_usage: "", caption_length: "" },
  written_conventions: { spelling_variant: "au_uk", punctuation_rules: "", always_write: "", avoid_phrases: [] },
  commercial: { hero_service: "", desired_outcome: "", secondary_services_text: "", proof_points: "", market_tier: "", content_objectives: [], cta_style: "" },
  ideal_client_v2: { summary: "", age_range: "", audience_gender: "", lifestyle: "", problem: "", feeling_after_booking: "", buying_motivation: "", fears_objections: "", trust_signals: "", pays_more_for: "", visual_taste: "", client_language: "", language_to_avoid: "" },
  content_strategy: { pillars_ranked: [], output_formats: [], pillar_notes: "", targets: { bookings_per_week: "", posts_per_week: "" } },
  compliance: { client_consent_status: "", before_after_rules: "", claims_to_avoid: "", do_not_invent: "", product_ip_accuracy: "", hand_detail_handling: "", text_legibility_alt: "", regulated_ack: false, medical_aesthetics_practitioner: false },
  signature_system: { recurring_motif: "", framing_habit: "", colour_discipline: "", type_rule: "", finish: "", light_signature: "", always_absent: "" },
};

export type SectionId =
  | "foundations" | "essence" | "visual_identity" | "moodboard" | "image_direction"
  | "output_formats" | "typography" | "voice" | "written_conventions" | "commercial"
  | "ideal_client" | "content_strategy" | "asset_library" | "compliance"
  | "signature_system" | "completion";

export type SectionDef = {
  id: SectionId;
  group: "Brand" | "Visual" | "Voice" | "Commercial" | "Compliance" | "Output";
  title: string;
  help: string;
};

export const SECTIONS: SectionDef[] = [
  { id: "foundations",         group: "Brand",      title: "Brand Foundations",      help: "Name, categories, location and what you want to be known for." },
  { id: "essence",             group: "Brand",      title: "Brand Essence",          help: "Your brand world and the feeling your imagery should give." },
  { id: "visual_identity",     group: "Visual",     title: "Visual Identity",        help: "Palette, logo and the visual styles your brand leans into." },
  { id: "moodboard",           group: "Visual",     title: "Moodboard References",   help: "References that shape your visual direction. They guide, never recreate." },
  { id: "image_direction",     group: "Visual",     title: "Image Direction",        help: "Lighting, composition, environments and textures." },
  { id: "typography",          group: "Visual",     title: "Typography",             help: "Heading and body styles, capitalisation and placement." },
  { id: "asset_library",       group: "Visual",     title: "Asset Library",          help: "Your own files — headshots, work, space, products — with usage rules." },
  { id: "signature_system",    group: "Visual",     title: "Signature System",       help: "A handful of non-negotiables that should be true of every asset." },
  { id: "voice",               group: "Voice",      title: "Voice",                  help: "How you sound — three words, perception and caption style." },
  { id: "written_conventions", group: "Voice",      title: "Written Conventions",    help: "Spelling, punctuation and words to avoid." },
  { id: "commercial",          group: "Commercial", title: "Services & Commercial",  help: "Hero service, outcomes, market tier and call-to-action style." },
  { id: "ideal_client",        group: "Commercial", title: "Ideal Client",           help: "Who you want to attract and what they care about." },
  { id: "content_strategy",    group: "Commercial", title: "Content Strategy",       help: "Pillars, formats and weekly targets." },
  { id: "compliance",          group: "Compliance", title: "Compliance",             help: "AHPRA-aware guardrails for Medical Aesthetics practitioners." },
  { id: "output_formats",      group: "Output",     title: "Output Formats",         help: "Platforms, aspect ratios, safe zones and finish." },
  { id: "completion",          group: "Brand",      title: "Brand DNA Strength",     help: "How rich your Brand DNA is — encouraging, not blocking." },
];
