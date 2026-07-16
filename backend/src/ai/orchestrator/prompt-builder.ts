// ============================================================================
// prompt-builder.ts — Modular Prompt Assembly (Pure TypeScript, No LLM Call)
// Assembles the complete prompt from named, independently cacheable fragments.
// ============================================================================

import { buildStyleDirectionBlock } from '../config/visual-style-library';
import type {
  BrandDNARecord,
  GoldenExample,
  BusinessGoalType,
  SocialPlatform,
  ConsentRestrictions,
} from '../types/job-payload.types';
import type { VisionAnalysisResult, AssembledPrompt } from '../types/chain-output.types';
import { PromptCache } from './prompt-cache';
import { getGuardrailsForService, type ServiceCategory } from '../config/service-guardrails';
import { isMedicalAestheticsBrand } from '../config/medical-compliance';

// Business goal → prompt framing instruction
const GOAL_FRAMING: Record<BusinessGoalType, string> = {
  attract_new_clients: 'This content should specifically attract new clients who have never visited before. Emphasise the transformation, the welcoming atmosphere, and an irresistible reason to book.',
  fill_quiet_days: 'This content should create urgency and promote available appointment slots. Include a sense of exclusivity or a time-sensitive angle without being pushy.',
  promote_high_margin_services: 'This content should position this service as a premium, high-value treatment worth investing in. Highlight the craft, the results, and the longevity of the outcome.',
  build_brand_authority: 'This content should establish expertise and industry authority. Showcase technical knowledge, professional techniques, and the technician\'s mastery of their craft.',
  retain_existing_clients: 'This content should speak to loyal, returning clients. Create a sense of community, appreciation, and the value of maintaining their results.',
  launch_new_service: 'This content should generate excitement and curiosity about a new service offering. Create intrigue, highlight the innovation, and invite early adopters.',
  seasonal_promotion: 'This content should capitalise on the current season or upcoming occasion. Make it timely, relevant, and create gentle urgency.',
};

const PLATFORM_RULES: Record<SocialPlatform, string> = {
  instagram: `FORMAT RULES FOR INSTAGRAM:
- Structure: Hook sentence → 1–2 body sentences → CTA → (blank line) → Hashtags below
- Hook: Must earn a tap on "more" — name the specific result, use a number, or open a pattern interrupt. Never start with "I" or "She".
- Body: One concrete detail (the technique, the colour, the texture) + how the client felt or what changed
- CTA: One only — "DM to book", "book via link in bio", or "comment [WORD] for details" — make it feel like the natural next step
- Hashtags: 8–12 total — mix niche (e.g. #sydneybalayage), mid-tier (e.g. #balayage), and broad (e.g. #haircolour) — always after a blank line, never inside the caption
- Never use emojis mid-sentence — only at the end of a sentence, and only if the brand allows them`,

  facebook: `FORMAT RULES FOR FACEBOOK:
- Write like a personal post from the technician, not a brand broadcast — Facebook rewards authenticity
- Open with a human story hook: "Yesterday a client came in and…" or the result upfront: "8 hours. 4 foil placements. One very happy client."
- Longer form works well: 80–150 words. Give context, tell the micro-story of the appointment
- Hashtags: 3–5 maximum at the very end — Facebook penalises hashtag spam
- CTA: Drive direct messages, phone calls, or link clicks — "Message us to book" beats "DM for details" on Facebook
- No hashtags inside the caption body`,

  tiktok: `FORMAT RULES FOR TIKTOK:
- First 3 WORDS must be the hook — TikTok shows only one line before "more" and users scroll in milliseconds
- Write like you're speaking directly to camera: punchy, energetic, present tense
- Short sentences only — if it can't be said in one breath, split it into two
- Hashtags: 3–5 only — 1 trending sound/trend tag (e.g. #hairtok), 1 niche result tag (e.g. #blondebalayage), 1 location or broad tag
- No filler, no setup — every word must earn its place`,
};

const CAPTION_LENGTH_TARGETS: Record<string, string> = {
  short: '40–60 words maximum. Hook sentence + result + CTA only. Every word earns its place. No filler, no setup.',
  medium: '60–100 words. Hook + one sentence of context or craft detail + result + CTA. Do not pad.',
  long: '100–150 words. Hook + brief story or technical detail + transformation + CTA. Maximum depth without padding.',
};

const CRAFT_RULES = `PREMIUM CREATIVE STRATEGY RULES:
- You are a premium creative strategist and copywriter, not a generic AI content tool.
- Your goal is not to generate isolated posts. It is to help this beauty professional build a highly recognizable, commercially valuable, and cohesive brand presence over time.
- Write with elevated, sophisticated, and authentic service storytelling. Avoid cheesy marketing sales-talk.

HOOKS THAT STOP THE SCROLL:
- Lead with the specific result from this appointment — use the keyVisualDetail from the image analysis to anchor it
- Numbers stop the scroll: "12 weeks of root grow-out — gone." "4 hours. One foil placement. Zero heat damage."
- Name the exact technique with correct industry terminology — "lived-in balayage", "root smudge", "glass skin facial", "strip lash hybrid set" — not "hair colour" or "treatment"
- Capture the moment of reaction: "She literally grabbed my hand when she saw it in the mirror."
- NEVER open with: "I am so excited to share", "Meet [name]!", "Can we talk about…", "She came in for a…", "Another amazing…"

BODY (if medium or long length):
- One concrete technical or sensory detail anchored to THIS service — the colour direction, the placement technique, the product texture, the skin tone match
- Show what changed and how it felt — the transformation AND the human moment
- Match the rhythm and cadence of the golden examples exactly — if they write in short punchy bursts, do the same; if they write in flowing sentences, match that

CTA RULES:
- One only — make it feel like the obvious next step, not a sales pitch
- Great: "DM me if your balayage has been pulling brassy — I have thoughts."
- Great: "Book via link in bio — this season is filling up."
- Bad: "Book now! Link in bio! Don't miss out! 🙏🙏🙏"

SERVICE-SPECIFIC GUIDANCE:
- Hair colour: Name the technique + the target level/tone (e.g. "level 9 ash blonde", "cool brunette root smudge") — generic "hair colour" is wasted
- Skin/Injectables: Focus on texture, glow, freshness, the natural look — not the procedure name or brand
- Lashes/Brows: Describe the shape effect, the lift, the eye-opening result — lead with what the client now sees in the mirror
- Nails: The art detail, the finish, the longevity — lead with the visual, not the product name

NEVER USE (these are automatic AI tells — if any appear, score drops to 0.0):
- "luxurious", "transformative experience", "indulge in", "elevate your look", "self-care journey"
- "treat yourself", "glow up", "slay", "obsessed with this", "absolutely stunning", "game-changer"
- "look no further", "step into", "unlock", "say goodbye to", "we've got you covered", "just dropped"
- "delve", "journey", "oasis", "sanctuary", "meticulous", "nestled", "whimsical", "unveil"
- Stacked empty adjectives: "stunning, gorgeous, flawless result"
- Hashtags anywhere inside the caption body — they go ONLY in the hashtags array
- Any word from the Blacklisted Words list, including plurals and conjugated forms

THE "MESSY HUMAN" PACING DIRECTIVE (MANDATORY):
- Do not write standard 3-paragraph AI essays. Real technicians write from their phones between clients.
- Use conversational pacing. Break grammatical rules if it sounds more authentic.
- Use sentence fragments for impact. 
- Mimic the exact sentence length, rhythm, and colloquialisms found in the Golden Examples. If the Golden Examples are short and punchy, your output MUST be short and punchy.

BRAND VOICE CONFIDENCE SCORE (honest self-assessment — a low honest score triggers a better rewrite):
- 0.90–1.00: Used their vocabulary, matched their sentence rhythm, wrote a detail that could ONLY be from them
- 0.70–0.89: Clearly on-brand but 1–2 phrases feel slightly generic
- 0.50–0.69: Competent beauty caption but not distinctly theirs — any salon could post it
- Below 0.50: Off-voice entirely — generic, AI-sounding, does not reflect this technician

OUTPUT:
- Always write in first person as the technician
- Return ONLY valid JSON — no markdown, no explanation, no preamble`;

export class PromptBuilder {
  constructor(private readonly cache: PromptCache) {}

  async assembleGenerationPrompt(params: {
    brandDNA: BrandDNARecord;
    visionResult: VisionAnalysisResult | null;
    businessGoal: BusinessGoalType;
    goldenExamples: GoldenExample[];
    platform: SocialPlatform;
    serviceCategory?: ServiceCategory;
    masterPromptText?: string;
    consentRestrictions?: ConsentRestrictions;
    appointmentContext?: {
      serviceName?: string;
      clientFirstName?: string;
      serviceCategory?: string;
    };
    contentPillar?: string;
    recentFeedback?: Array<{
      actionType: string;
      reasonTag?: string | null;
      customComment?: string | null;
      originalText?: string | null;
      editedText?: string | null;
    }>;
    moodboardVisionSummary?: string;
    assetLibraryVisionSummary?: string;
  }): Promise<AssembledPrompt> {
    const { brandDNA, visionResult, businessGoal, goldenExamples, platform, serviceCategory = 'general', masterPromptText, consentRestrictions, appointmentContext, contentPillar, recentFeedback, moodboardVisionSummary, assetLibraryVisionSummary } = params;

    const { brandDNAFragment, brandDNACacheHit } = await this.getBrandDNAFragment(brandDNA);
    const { goldenExamplesFragment, goldenExamplesCacheHit } =
      await this.getGoldenExamplesFragment(brandDNA.tenantId, brandDNA.version, goldenExamples);

    const systemPrompt = masterPromptText 
      ? this.buildDynamicSystemPrompt(masterPromptText) 
      : this.buildSystemPrompt();
      
    const visionSection = visionResult ? this.buildVisionSection(visionResult) : '';
    const goalSection = GOAL_FRAMING[businessGoal] ?? 'Generate engaging content.';
    const platformSection = PLATFORM_RULES[platform];
    const lengthTarget = CAPTION_LENGTH_TARGETS[brandDNA.captionLengthPreference] || CAPTION_LENGTH_TARGETS['medium'];
    const lengthSection = `CAPTION LENGTH: ${lengthTarget} Do NOT write a long essay. Instagram users stop reading after 2–3 lines.`;

    const consentSection = this.buildConsentRestrictionsSection(consentRestrictions);

    const appointmentSection = this.buildAppointmentSection(appointmentContext, consentRestrictions);

    // Medical flag: fires from (1) this appointment's category, or (2)/(3) the technician's
    // Brand DNA (practitioner flag / service categories) — see medical-compliance.ts.
    const isMedicalByCategory = serviceCategory === 'injectables_cosmetic' || serviceCategory === 'laser_treatments';
    const isMedical = isMedicalByCategory || isMedicalAestheticsBrand(brandDNA);
    const medicalComplianceSection = isMedical
      ? `## AHPRA MEDICAL COMPLIANCE RULES (MANDATORY):
- This is a regulated medical aesthetics service. You MUST follow AHPRA guidelines.
- Focus ONLY on skin literacy, safety principles, consultation preparation, practitioner standards, and clinic philosophy.
- Do NOT use testimonials, client quotes, or outcome promises.
- Do NOT encourage immediate booking or create false urgency (e.g. no "only 2 slots left!", "book now!").
- Do NOT frame this as transformation marketing. Focus on education and trust-building.
- Add this mandatory clinical disclaimer to the very end of the caption: "Individual results vary. Consultation is required before treatment. All medical procedures carry risks."`
      : '';

    const pillarInstruction = contentPillar ? `## DYNAMIC GRID CONTENT PILLAR (MANDATORY DIRECTION):
You MUST format/orient this post to align with the '${contentPillar.toUpperCase().replace(/_/g, ' ')}' pillar:
- CLIENT RESULTS: Focus on clinical/technical work details, the physical results of this treatment, and micro-aesthetic details.
- BEHIND THE SCENES: Focus on practitioner process, salon vibes, or personal micro-stories from the chair.
- EDUCATION TIPS: Focus on post-care literacy, skincare ingredients, micro-tips, or treatment science. Strict compliance rule: Do NOT write a client case study or mention specific visit outcomes (e.g. do not say "Deg walked away with smoother skin"). Re-orient the copy to teach general skincare principles or ingredient benefits.
- PROMOTION: Focus on gentle slot urgencies, booking CTAs, or positioning high-margin treatments.` : '';

    // Compile recent feedbacks into active prompting constraints
    let feedbackInstruction = '';
    if (recentFeedback && recentFeedback.length > 0) {
      const rejections = recentFeedback.filter(f => f.actionType === 'rejected');
      const edits = recentFeedback.filter(f => f.actionType === 'edited');
      const parts: string[] = [];

      if (rejections.length > 0) {
        parts.push('## MANDATORY ADJUSTMENTS FROM PREVIOUS REJECTIONS:');
        parts.push('The client recently rejected draft posts for the following reasons. You MUST strictly adjust your writing style to avoid these errors:');
        rejections.forEach(r => {
          if (r.reasonTag) {
            const mapped = {
              too_salesy: '- AVOID aggressive promotion, sales buzzwords, or pushy booking demands. Keep the tone soft and educational.',
              too_generic: '- AVOID generic beauty copy. Use specific technical/treatment details rather than empty aesthetic fluff.',
              off_brand: '- AVOID breaking brand character. Match their preferred tone, pace, and clinic profile exactly.',
            }[r.reasonTag];
            if (mapped) parts.push(mapped);
          }
          if (r.customComment) {
            parts.push(`- USER DIRECTIVE: "${r.customComment}"`);
          }
        });
      }

      if (edits.length > 0) {
        parts.push('\n## LEARNING EXAMPLES FROM MANUAL USER EDITS:');
        parts.push('Study how the user edited your past drafts, and mimic their writing conventions, word choice, and structure:');
        edits.slice(0, 3).forEach((e, idx) => {
          parts.push(`Example ${idx + 1}:`);
          parts.push(`- Draft provided: "${e.originalText}"`);
          parts.push(`- How user corrected it: "${e.editedText}"`);
        });
      }

      feedbackInstruction = parts.join('\n');
    }

    const userPrompt = [
      '## BRAND STYLE & AESTHETIC GUIDELINES (How the content must feel)',
      brandDNAFragment,
      '',
      medicalComplianceSection ? '## AHPRA MEDICAL COMPLIANCE' : '',
      medicalComplianceSection,
      medicalComplianceSection ? '' : '',
      '## APPOINTMENT CONTEXT',
      appointmentSection,
      '',
      '## IMAGE ANALYSIS',
      visionSection || '(No image provided — generate based on appointment context only)',
      '',
      moodboardVisionSummary ? '## MOODBOARD VISUAL DIRECTION (extracted from brand reference images)' : '',
      moodboardVisionSummary ?? '',
      moodboardVisionSummary ? '' : '',
      assetLibraryVisionSummary ? '## BRAND ENVIRONMENT CONTEXT (extracted from asset library)' : '',
      assetLibraryVisionSummary ?? '',
      assetLibraryVisionSummary ? '' : '',
      contentPillar ? '## DYNAMIC CONTENT PILLAR' : '',
      pillarInstruction,
      contentPillar ? '' : '',
      feedbackInstruction ? '## CLIENT FEEDBACK LEARNING INPUTS' : '',
      feedbackInstruction,
      feedbackInstruction ? '' : '',
      '## YOUR BUSINESS GOAL THIS WEEK',
      goalSection,
      '',
      '## PLATFORM',
      platformSection,
      '',
      '## LENGTH REQUIREMENT',
      lengthSection,
      '',
      consentSection ? '## CLIENT CONSENT RESTRICTIONS' : '',
      consentSection,
      consentSection ? '' : '',
      '## SAFETY GUARDRAILS',
      getGuardrailsForService(serviceCategory),
      '',
      '## YOUR BEST PAST CONTENT (FEW-SHOT EXAMPLES)',
      goldenExamplesFragment,
      '',
      '## OUTPUT FORMAT',
      this.buildOutputFormatSection(),
    ].filter(Boolean).join('\n');

    return {
      systemPrompt,
      userPrompt,
      cacheHits: { brandDNAFragment: brandDNACacheHit, goldenExamplesFragment: goldenExamplesCacheHit },
    };
  }

  assembleTweakPrompt(params: {
    previousCaption: string;
    previousHashtags: string[];
    tweakInstruction: string;
    brandDNA: BrandDNARecord;
    platform: SocialPlatform;
  }): { systemPrompt: string; userPrompt: string } {
    const { previousCaption, previousHashtags, tweakInstruction, brandDNA } = params;

    const systemPrompt = `You are editing a social media caption for ${brandDNA.businessName}.
Their brand voice is: ${(brandDNA.primaryTone ?? '').replace(/_/g, ' ')}.
They NEVER use these words: ${brandDNA.vocabularyBlacklist.join(', ')}.
Make ONLY the specific change requested. Preserve the brand voice exactly.
Return JSON with the same structure as the original caption.`;

    const userPrompt = `ORIGINAL CAPTION:\n${previousCaption}\n\nORIGINAL HASHTAGS:\n${previousHashtags.join(' ')}\n\nTWEAK REQUESTED:\n${tweakInstruction}\n\nApply only this specific change. Return the updated caption and hashtags as JSON.`;

    return { systemPrompt, userPrompt };
  }

  private async getBrandDNAFragment(
    brandDNA: BrandDNARecord
  ): Promise<{ brandDNAFragment: string; brandDNACacheHit: boolean }> {
    const cached = await this.cache.getBrandDNAFragment(brandDNA.tenantId, brandDNA.version);
    if (cached) return { brandDNAFragment: cached, brandDNACacheHit: true };
    const fragment = this.buildBrandDNAFragment(brandDNA);
    await this.cache.setBrandDNAFragment(brandDNA.tenantId, brandDNA.version, fragment);
    return { brandDNAFragment: fragment, brandDNACacheHit: false };
  }

  private async getGoldenExamplesFragment(
    tenantId: string,
    version: number,
    examples: GoldenExample[]
  ): Promise<{ goldenExamplesFragment: string; goldenExamplesCacheHit: boolean }> {
    const cached = await this.cache.getGoldenExamplesFragment(tenantId, version);
    if (cached) return { goldenExamplesFragment: cached, goldenExamplesCacheHit: true };
    const fragment = this.buildGoldenExamplesFragment(examples);
    await this.cache.setGoldenExamplesFragment(tenantId, version, fragment);
    return { goldenExamplesFragment: fragment, goldenExamplesCacheHit: false };
  }

  private buildSystemPrompt(): string {
    return `You are a premium creative strategist and copywriter for luxury beauty and wellness brands.
Your goal is to help the technician build a recognizable, highly cohesive, and commercially valuable social media presence over time.

${CRAFT_RULES}`;
  }

  private buildDynamicSystemPrompt(masterPromptText: string): string {
    return `${masterPromptText}

${CRAFT_RULES}`;
  }

  private buildBrandDNAFragment(dna: BrandDNARecord): string {
    const arr = (v: unknown) => (Array.isArray(v) ? v : []);
    const str = (v: unknown, fallback = '') => (v != null ? String(v) : fallback);
    const tone = (v: unknown) => str(v).replace(/_/g, ' ');

    const preferred = arr(dna.vocabularyPreferred);
    const blacklist = arr(dna.vocabularyBlacklist);
    const doNotSay = arr(dna.doNotSay);
    const painPoints = arr(dna.clientPainPoints);

    // Support for new refactored brandDnaV2 JSON schema from coworker's branch
    if (dna.brandDnaV2) {
      try {
        const v2 = (typeof dna.brandDnaV2 === 'string' ? JSON.parse(dna.brandDnaV2) : dna.brandDnaV2) as Record<string, any>;
        
        const foundations = v2.foundations || {};
        const essence = v2.essence || {};
        const visual = v2.visual_identity || {};
        const voice = v2.voice_v2 || {};
        const written = v2.written_conventions || {};
        const commercial = v2.commercial || {};
        const client = v2.ideal_client_v2 || {};
        const compliance = v2.compliance || {};
        const signature = v2.signature_system || {};

        const avoidList = arr(written.avoid_phrases || blacklist);

        return [
          `## YOUR BRAND DNA (V2)`,
          `**Business:** ${str(dna.businessName)}`,
          foundations.professional_name ? `**Professional Name:** ${str(foundations.professional_name)}` : '',
          foundations.niche ? `**Niche & Speciality:** ${str(foundations.niche)}` : '',
          foundations.known_for ? `**Known For:** ${str(foundations.known_for)}` : '',
          foundations.what_makes_different ? `**What Makes You Different:** ${str(foundations.what_makes_different)}` : '',
          foundations.reputation_asset ? `**Reputation Asset:** ${str(foundations.reputation_asset)}` : '',
          essence.one_sentence ? `**Brand Essence/One-Liner:** "${str(essence.one_sentence)}"` : '',
          essence.world_anchor ? `**Brand World Anchor:** ${str(essence.world_anchor)}` : '',
          essence.image_energy ? `**Image Energy Mood:** ${str(essence.image_energy)}` : '',
          visual.palette ? `**Visual Palette:** Primary: ${str(visual.palette.primary)}, Secondary: ${str(visual.palette.secondary)}, Background: ${str(visual.palette.background)}, Accent: ${str(visual.palette.accent)}${visual.palette.depth ? `, Depth (text/headings only): ${str(visual.palette.depth)}` : ''}` : '',
          visual.colours_to_avoid ? `**Colours to avoid in visuals:** ${str(visual.colours_to_avoid)}` : '',
          visual.never_look_like ? `**Your brand visuals must NEVER look like:** ${str(visual.never_look_like)}` : '',
          Array.isArray(visual.style_ranking) && visual.style_ranking.length > 0
            ? buildStyleDirectionBlock(visual.style_ranking)
            : '',
          arr(dna.moodboardLabels).length > 0
            ? `**Visual references (moodboard — use for feel, not to copy):** ${arr(dna.moodboardLabels).map((label: string, i: number) => `Reference ${i + 1}: ${label}`).join('. ')}.`
            : '',
          signature.recurring_motif ? `**Signature Motif/Device:** ${str(signature.recurring_motif)}` : '',
          signature.colour_discipline ? `**Signature Colour Discipline:** ${str(signature.colour_discipline)}` : '',
          voice.three_words ? `**Voice Tone (3 words):** ${str(voice.three_words)}` : '',
          voice.perception ? `**Consumer Perception Objective:** ${str(voice.perception)}` : '',
          voice.proof ? `**Signature Proof Pillar:** ${str(voice.proof)}` : '',
          voice.caption_style ? `**Caption Style Notes:** ${str(voice.caption_style)}` : '',
          voice.vocabulary ? `**Preferred Vocabulary:** ${str(voice.vocabulary)}` : '',
          avoidList.length ? `**BLACKLISTED WORDS & PHRASES (NEVER USE):** ${avoidList.join(', ')}` : '',
          commercial.cta_style ? `**CTA Style Rule:** ${str(commercial.cta_style)}` : '',
          commercial.desired_outcome ? `**Desired Client Outcome:** ${str(commercial.desired_outcome)}` : '',
          client.problem ? `**Target Client Pain Points:** ${str(client.problem)}` : '',
          client.fears_objections ? `**Objections/Fears to address:** ${str(client.fears_objections)}` : '',
          client.trust_triggers ? `**What builds trust for this client:** ${str(client.trust_triggers)}` : '',
          client.visual_taste ? `**Client visual taste:** ${str(client.visual_taste)}` : '',
          client.buying_triggers ? `**What motivates this client to book:** ${str(client.buying_triggers)}` : '',
          client.lifestyle ? `**Client lifestyle context:** ${str(client.lifestyle)}` : '',
          compliance.do_not_invent ? `**Strict Verification Rule:** ${str(compliance.do_not_invent)}` : '',
          compliance.before_after_rules ? `**Before/After Compliance Rules:** ${str(compliance.before_after_rules)}` : '',
        ].filter(Boolean).join('\n');
      } catch (err) {
        console.error('Failed to parse brandDnaV2. Falling back to v1 format:', err);
      }
    }

    const brandTierLabel: Record<string, string> = {
      luxury: 'Luxury — premium pricing, aspirational tone, high-polish language',
      mainstream: 'Mainstream — professional but approachable, results-focused',
      accessible: 'Accessible — friendly, down-to-earth, community-first',
    };

    return [
      `## YOUR BRAND DNA`,
      `**Business:** ${str(dna.businessName)}${dna.locationCity ? ` — ${str(dna.locationCity)}` : ''}`,
      dna.brandTier ? `**Brand positioning:** ${brandTierLabel[str(dna.brandTier)] ?? str(dna.brandTier)}` : '',
      dna.primaryPersona ? `**Primary client:** ${str(dna.primaryPersona)}` : '',
      dna.secondaryPersona ? `**Secondary client:** ${str(dna.secondaryPersona)}` : '',
      painPoints.length ? `**Client pain points to speak to:** ${painPoints.join(', ')}` : '',
      dna.clientFears ? `**Objections/Fears to address:** ${str(dna.clientFears)}` : '',
      dna.clientTrustTriggers ? `**What builds trust for this client:** ${str(dna.clientTrustTriggers)}` : '',
      dna.clientVisualTaste ? `**Client visual taste:** ${str(dna.clientVisualTaste)}` : '',
      dna.clientBuyingTriggers ? `**What motivates this client to book:** ${str(dna.clientBuyingTriggers)}` : '',
      dna.audienceLifestyle ? `**Client lifestyle context:** ${str(dna.audienceLifestyle)}` : '',
      dna.oneLiner ? `**Your one-liner (this is your voice):** "${str(dna.oneLiner)}"` : '',
      dna.uniqueSellingProposition ? `**What makes you different:** ${str(dna.uniqueSellingProposition)}` : '',
      dna.signatureOutcome ? `**Signature result you deliver:** ${str(dna.signatureOutcome)}` : '',
      dna.primaryTone ? `**Primary tone:** ${tone(dna.primaryTone)}` : '',
      dna.secondaryTone ? `**Secondary tone:** ${tone(dna.secondaryTone)}` : '',
      dna.moodTag ? `**Brand mood:** ${str(dna.moodTag)}` : '',
      Array.isArray(dna.visualRanking) && dna.visualRanking.length > 0
        ? buildStyleDirectionBlock(dna.visualRanking)
        : dna.aestheticDirection ? `**Aesthetic direction:** ${str(dna.aestheticDirection)}` : '',
      (function() {
        const cache = Array.isArray((dna as any).moodboardIntentsCache) ? (dna as any).moodboardIntentsCache : [];
        const moods = cache.filter((c: any) => ['mood', 'vibe', 'style'].includes(c.intent?.toLowerCase()));
        if (moods.length > 0) {
          const selectedMoods = moods.map((m: any) => m.summary).join(' ');
          return `**Moodboard Tone Directive (CRITICAL):** Adopt a brand voice and aesthetic tone that perfectly matches this moodboard direction: ${selectedMoods}`;
        }
        return Array.isArray(dna.moodboardLabels) && dna.moodboardLabels.length > 0
          ? `**Visual references (moodboard — use for feel, not to copy):** ${(dna.moodboardLabels as string[]).map((label, i) => `Reference ${i + 1}: ${label}`).join('. ')}.`
          : '';
      })(),
      dna.depthBrandColor ? `**Depth brand colour (for text/headings only):** ${str(dna.depthBrandColor)}` : '',
      dna.formattingStyle ? `**Caption style notes:** ${str(dna.formattingStyle)}` : '',
      preferred.length ? `**Vocabulary you love (use these):** ${preferred.join(', ')}` : '',
      blacklist.length ? `**BLACKLISTED WORDS — NEVER USE IN ANY FORM:** ${blacklist.join(', ')}` : '',
      doNotSay.length ? `**Phrases you never say:** ${doNotSay.join(', ')}` : '',
      dna.emojiPolicy === 'none'
        ? '**Emojis:** NEVER — not even one, anywhere.'
        : dna.emojiPolicy === 'frequent'
          ? '**Emojis:** Use freely — 3–5 relevant emojis in the caption.'
          : dna.emojiPolicy === 'moderate'
            ? '**Emojis:** 1–2 only, placed at the end of a sentence where they feel natural.'
            : '**Emojis:** Minimal — at most 1, only if it genuinely adds something.',
    ].filter(Boolean).join('\n');
  }

  private buildGoldenExamplesFragment(examples: GoldenExample[]): string {
    if (examples.length === 0) return '(No past examples yet — write entirely from the Brand DNA voice described above)';
    const exampleText = examples.slice(0, 5).map((ex, i) =>
      `**Example ${i + 1} (${ex.platform} · quality ${ex.qualityScore.toFixed(2)}/1.00):**\n"${ex.captionText}"\nHashtags: ${ex.hashtags.join(' ')}`
    ).join('\n\n');
    return `These are this technician's real, highest-rated posts. Study the sentence length, vocabulary, punctuation style, and rhythm — then match it exactly in your output. Do not average their style; replicate it:\n\n${exampleText}`;
  }

  private buildAppointmentSection(
    ctx?: { serviceName?: string; clientFirstName?: string; serviceCategory?: string },
    consent?: ConsentRestrictions,
  ): string {
    if (!ctx) return '(No appointment context provided)';
    const lines: string[] = [];
    if (ctx.serviceName) lines.push(`**Service performed:** ${ctx.serviceName}`);
    if (ctx.serviceCategory) lines.push(`**Service category:** ${ctx.serviceCategory}`);
    if (ctx.clientFirstName && consent?.use_name !== false) {
      lines.push(`**Client first name:** ${ctx.clientFirstName} (consent granted to use their name)`);
    }
    return lines.length > 0 ? lines.join('\n') : '(No specific appointment details available)';
  }

  private buildVisionSection(vision: VisionAnalysisResult): string {
    return [
      `**Service:** ${vision.servicePerformed}`,
      `**Tags:** ${vision.serviceTags.join(', ')}`,
      `**Technical detail:** ${vision.technicalDetails}`,
      `**Transformation:** ${vision.transformationDescription}`,
      vision.keyVisualDetail ? `**Key visual detail (anchor your hook here):** ${vision.keyVisualDetail}` : '',
      `**Setting:** ${vision.settingDetected}`,
      `**Image quality:** ${vision.imageQuality}`,
      `**Faces visible:** ${vision.facesDetected ? 'Yes' : 'No'}`,
    ].filter(Boolean).join('\n');
  }

  private buildConsentRestrictionsSection(restrictions?: ConsentRestrictions): string {
    if (!restrictions) return '';
    const lines: string[] = [];
    if (!restrictions.use_name) lines.push('- **Client name: NOT allowed** — do not reference the client by name, e.g. no "Sarah\'s glow-up" or similar');
    if (!restrictions.allow_tagging) lines.push('- **Social tagging: NOT allowed** — do not suggest tagging the client or use language like "tag a friend who needs this"');
    if (!restrictions.allow_extended_use) lines.push('- **Platform promotion: NOT allowed** — do not write content framed for showcases, awards, or platform-level promotion');
    if (!restrictions.allow_before_after) lines.push('- **Before/after references: NOT allowed** — do not reference the before state or describe it as a transformation');
    if (!restrictions.show_face) lines.push('- **Face references: NOT allowed** — do not describe facial features or imply the client\'s face is visible');
    if (lines.length === 0) return '';
    return `You MUST follow these client consent restrictions. Violating them is a serious breach of client trust:\n${lines.join('\n')}`;
  }

  private buildOutputFormatSection(): string {
    return `Return ONLY this exact JSON structure — no markdown, no extra fields:\n{\n  "caption": "The full caption text — obey the LENGTH REQUIREMENT section above exactly",\n  "hookSentence": "The first sentence optimised for the More cutoff",\n  "callToAction": "The CTA phrase",\n  "hashtags": ["livedInBlonde", "hairColour", "sydneyhair"],\n  "altText": "Accessibility description of the image",\n  "estimatedReadTime": 12,\n  "brandVoiceConfidenceScore": 0.87\n}\n\nCRITICAL: hashtags must NOT include the # symbol — write the word only (e.g. "hairColour" not "#hairColour"). No double ##.\nThe brandVoiceConfidenceScore must be your honest self-assessment (0.0–1.0) of how well this caption matches the provided Brand DNA.`;
  }
}
