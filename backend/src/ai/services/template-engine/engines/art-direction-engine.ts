import designKnowledgeMap from '../../../config/design-knowledge-map.json';
import { VisualRecipe, ColorRecipe, TypographyRecipe, PrimitiveRecipe, TextureRecipe, HeroRecipe, IDesignIntent } from '../interfaces';

// ─── 1. INTERFACES ───



export interface IDesignBehaviorProfile {
  heroBaseFontSize: number;
  metadataBaseFontSize: number;
  bodyBaseFontSize: number;
  trackingHero: number;
  trackingMetadata: number;
  lineHeightMultiplier: number;
  capitalizationRule: 'force_lowercase' | 'force_uppercase' | 'none';
  paragraphIndentation: boolean;
  orphanControl: boolean;
  verticalTextAllowance: 'allowed' | 'forced_on_tagline' | 'forbidden';
  textRotationAngle: number;
  secondaryTextOpacity: number;

  gridColumns: number;
  negativeSpaceMultiplier: number;
  marginHugging: boolean;
  elementOverlapAllowed: boolean;
  imageBleedExtent: 'full' | 'contained_70' | 'asymmetrical_65';
  cropIntent: 'tight_macro' | 'environmental_wide';
  focalPointOffset: string;
  zIndexReordering: string;

  captionBarStyling: 'floating_pill' | 'ribbon' | 'none';
  borderRadius: number;
  dividerStrokeWeight: number;
  dividerPadding: number;
  noiseIntensity: number;
  colorBlendingMode: string;
  backgroundContrastShift: number;
  logoWeightAndPlacement: string;
  badgeIntrusion: boolean;
  photographyTinting: string;
  dropShadowPhysics: string;
  readingSequenceEnforcement: string;
}

export interface IDesignLanguage {
  intent: IDesignIntent;
  behavior: IDesignBehaviorProfile;
}

// ─── 2. ART DIRECTION ENGINE ───

export class ArtDirectionEngine {

  /**
   * Generates Semantic Design Intent from knowledge tags and carousel rhythm
   */
  public generateDesignIntent(layoutId: string, slideIndex?: number, totalSlides?: number): IDesignIntent {
    // 1. Procedural Layout Interception
    // Strip numeric suffixes from compiled procedural variants (e.g. editorial_hero_0 -> editorial_hero)
    const baseId = layoutId.replace(/_\d+$/, '');

    let family = 'editorial';
    let energy = 'calm';
    let balance = 'symmetrical';
    let readingFlow = 'center_anchored';

    let foundKnowledge = false;

    // Hardcode semantic DNA for our new procedural Phase 3 recipes
    if (baseId === 'editorial_hero') {
      energy = 'bold';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern';
      foundKnowledge = true;
    } else if (baseId === 'editorial_quote') {
      energy = 'minimal';
      balance = 'symmetrical';
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId === 'editorial_informational') {
      energy = 'structured';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern';
      foundKnowledge = true;
    } else if (baseId === 'editorial_breather') {
      energy = 'bold';
      balance = 'symmetrical';
      readingFlow = 'center_anchored';
      foundKnowledge = true;
    } else if (baseId.startsWith('editorial')) {
      family = 'editorial';
      energy = 'bold';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern';
      foundKnowledge = true;
    } else if (baseId === 'premium_text_only' || baseId.startsWith('premium')) {
      family = 'premium';
      energy = 'bold';
      balance = 'symmetrical';
      readingFlow = 'center_anchored';
      foundKnowledge = true;
    } else if (baseId.startsWith('split')) {
      family = 'split';
      energy = 'structured';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern'; // photo and text occupy distinct halves/bands, eye moves between them
      foundKnowledge = true;
    } else if (baseId.startsWith('countdown_promo')) {
      family = 'countdown_promo';
      energy = 'bold';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern'; // urgency-driven layouts favor a punchy, directional read
      foundKnowledge = true;
    } else if (baseId.startsWith('product_showcase')) {
      family = 'product_showcase';
      energy = 'calm';
      balance = 'symmetrical'; // product-hero layouts are centered/balanced around the subject
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId.startsWith('before_after')) {
      family = 'before_after';
      energy = 'bold'; // a transformation reveal is a dramatic moment
      balance = 'symmetrical'; // two genuinely equal photo halves
      readingFlow = 'center_down'; // matches the dominant mined readingFlow (31/45 real samples)
      foundKnowledge = true;
    } else if (baseId.startsWith('testimonial')) {
      family = 'testimonial';
      energy = 'calm'; // warm, personal, not a hard sell
      balance = 'symmetrical'; // centered quote/portrait
      readingFlow = 'center_down'; // matches the dominant mined readingFlow (20/24 real samples)
      foundKnowledge = true;
    } else if (baseId.startsWith('scrapbook')) {
      family = 'scrapbook';
      energy = 'structured'; // neither bold nor quiet -> lands on the playful/layered storytelling style
      balance = 'symmetrical';
      readingFlow = 'center_down'; // matches all 5 real mined samples
      foundKnowledge = true;
    } else if (baseId.startsWith('quadrant')) {
      family = 'quadrant';
      energy = 'structured'; // grid/badge structure reads as deliberate, not loud or minimal
      balance = 'symmetrical';
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId.startsWith('transformation')) {
      family = 'transformation';
      energy = 'calm'; // matches the mined energy (13/13 real samples) - a journey, not a hard sell
      balance = 'asymmetrical'; // matches the dominant mined balance (7/13 real samples)
      readingFlow = 'center_down'; // matches the dominant mined readingFlow (9/13 real samples)
      foundKnowledge = true;
    } else if (baseId.startsWith('magazine')) {
      family = 'magazine';
      energy = 'calm'; // matches the dominant mined energy (9/10 real samples)
      balance = 'asymmetrical'; // matches the mined balance (10/10 real samples)
      readingFlow = 'z_pattern'; // matches the dominant mined readingFlow (7/10 real samples)
      foundKnowledge = true;
    } else if (baseId.startsWith('polaroid')) {
      family = 'polaroid';
      energy = 'calm'; // matches the dominant mined energy (4/5 real samples)
      balance = 'asymmetrical'; // matches the mined balance (5/5 real samples)
      readingFlow = 'center_down'; // matches the dominant mined readingFlow (3/5 real samples)
      foundKnowledge = true;
    } else if (baseId.startsWith('notification_card')) {
      family = 'notification_card';
      energy = 'calm'; // only 1 real mined sample exists for this family (design-knowledge.json) - grounded in that sample's energy
      balance = 'symmetrical'; // matches the 1 mined sample
      readingFlow = 'center_down'; // matches the 1 mined sample
      foundKnowledge = true;
    } else if (baseId.startsWith('announcement')) {
      family = 'announcement';
      energy = 'calm'; // only 1 real mined sample exists for this family (design-knowledge.json) - grounded in that sample's energy
      balance = 'asymmetrical'; // matches the 1 mined sample
      readingFlow = 'z_pattern'; // matches the 1 mined sample
      foundKnowledge = true;
    } else if (baseId.startsWith('clinical')) {
      family = 'clinical';
      energy = 'structured';
      balance = 'symmetrical'; // Clinical needs high alignment
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId.startsWith('minimalist')) {
      family = 'minimalist';
      energy = 'minimal';
      balance = 'asymmetrical'; // Often uses negative space powerfully
      readingFlow = 'z_pattern';
      foundKnowledge = true;
    } else if (baseId.startsWith('educational')) {
      family = 'educational';
      energy = 'minimal';
      balance = 'symmetrical';
      readingFlow = 'center_down';
      foundKnowledge = true;
    }

    // 2. Legacy Knowledge Map Lookup
    if (!foundKnowledge) {
      const knowledge = (designKnowledgeMap as any)[layoutId];
      if (knowledge) {
        family = knowledge.layoutFamily?.value || family;
        energy = knowledge.visualLanguage?.energy || energy;
        balance = knowledge.composition?.balance || balance;
        readingFlow = knowledge.composition?.readingFlow || readingFlow;
        foundKnowledge = true;
      }
    }

    let whitespace: 'tight' | 'comfortable' | 'airy' | 'luxury' = 'comfortable';
    let mood: 'luxury' | 'organic' | 'clinical' | 'pop' | 'minimalist' = 'luxury';
    let visualPriority: 'typography_hero' | 'image_hero' | 'composition_hero' | 'cta_hero' = 'image_hero';
    let cardStyle: 'solid' | 'glass' | 'outlined' | 'floating' | 'none' = 'none';

    // Infer semantic intent from variant base names
    if (baseId.includes('quote') || baseId.includes('text_only')) {
      visualPriority = 'typography_hero';
      whitespace = 'airy';
      cardStyle = 'outlined';
    } else if (baseId.includes('hero')) {
      visualPriority = 'image_hero';
      whitespace = 'luxury';
    } else if (baseId.includes('split') || baseId.includes('collage')) {
      visualPriority = 'composition_hero';
      whitespace = 'tight';
      cardStyle = 'solid';
    } else if (baseId.includes('cta') || baseId.includes('promo')) {
      visualPriority = 'cta_hero';
      whitespace = 'tight';
      energy = 'bold';
      cardStyle = 'solid';
    }

    if (family === 'minimalist' || family === 'clinical') {
      mood = family === 'clinical' ? 'clinical' : 'minimalist';
      whitespace = 'luxury';
      energy = 'minimal';
    } else if (family === 'premium') {
      mood = 'luxury';
      whitespace = 'luxury';
    } else if (family === 'editorial') {
      mood = 'organic';
      whitespace = 'airy';
    }

    if (foundKnowledge) {
      console.log(`[ArtDirectionEngine] Extracted Semantic Tags for ${layoutId}:`, { family, energy, balance, readingFlow, visualPriority });
    } else {
      console.warn(`[ArtDirectionEngine] No knowledge found for ${layoutId}. Falling back to default.`);
    }

    // [PHASE 3: RHYTHM INJECTION] - Formalize the 4-slide musical rhythm
    let textureIntensity = mood === 'organic' ? 'heavy' : (mood === 'minimalist' ? 'subtle' : 'none');
    let density: 'none' | 'low' | 'medium' | 'high' = energy === 'bold' ? 'high' : 'low';

    if (slideIndex !== undefined && totalSlides !== undefined && totalSlides > 1) {
      const normalizedPos = slideIndex / (totalSlides - 1);

      // Dense -> Open -> Medium -> Minimal (or custom based on position)
      if (slideIndex === 0) {
        // Cover Slide: Punchy, tight, dense
        whitespace = 'tight';
        energy = 'bold';
        density = 'high';
        textureIntensity = 'heavy';
      } else if (slideIndex === totalSlides - 1) {
        // Final Slide: Clean, airy CTA
        whitespace = 'airy';
        energy = 'minimal';
        density = 'low';
        textureIntensity = 'none';
      } else if (normalizedPos <= 0.5) {
        // Slide 2: Comfortable breather
        whitespace = 'comfortable';
        energy = 'structured';
        density = 'medium';
      } else {
        // Slide 3: Luxury / Minimal
        whitespace = 'luxury';
        energy = 'playful';
        density = 'medium';
      }
      console.log(`[ArtDirectionEngine] Applied Rhythm (Slide ${slideIndex + 1}/${totalSlides}) - Whitespace: ${whitespace}, Density: ${density}, Energy: ${energy}`);
    }

    return {
      family,
      energy: energy as any,
      balance: balance as any,
      readingFlow: readingFlow as any,
      visualPriority: visualPriority as any,
      whitespace,
      mood,
      primitives: {
        cards: cardStyle,
        textureIntensity: textureIntensity as any,
        density: density
      }
    };
  }

  /**
   * Maps Semantic Intent to concrete rendering Behavior
   */
  public mapIntentToBehavior(intent: IDesignIntent): IDesignBehaviorProfile {
    // Start with a generic, safe baseline
    const profile: IDesignBehaviorProfile = {
      heroBaseFontSize: 90,
      metadataBaseFontSize: 24,
      bodyBaseFontSize: 32,
      trackingHero: 0,
      trackingMetadata: 0,
      lineHeightMultiplier: 1.1,
      capitalizationRule: 'none',
      paragraphIndentation: false,
      orphanControl: true,
      verticalTextAllowance: 'forbidden',
      textRotationAngle: 0,
      secondaryTextOpacity: 1.0,

      gridColumns: 12,
      negativeSpaceMultiplier: 1.0,
      marginHugging: false,
      elementOverlapAllowed: false,
      imageBleedExtent: 'full',
      cropIntent: 'environmental_wide',
      focalPointOffset: 'center',
      zIndexReordering: 'standard',

      captionBarStyling: 'none',
      borderRadius: 0,
      dividerStrokeWeight: 1,
      dividerPadding: 16,
      noiseIntensity: 0,
      colorBlendingMode: 'normal',
      backgroundContrastShift: 0,
      logoWeightAndPlacement: 'standard',
      badgeIntrusion: false,
      photographyTinting: 'none',
      dropShadowPhysics: 'none',
      readingSequenceEnforcement: 'standard'
    };

    // Apply strict geometric overrides based on philosophical intent

    if (intent.visualPriority === 'typography_hero') {
      profile.heroBaseFontSize = 140;
      profile.metadataBaseFontSize = 20;
      profile.bodyBaseFontSize = 28;
      profile.elementOverlapAllowed = true;
      profile.marginHugging = true;
    } else {
      profile.heroBaseFontSize = 100;
    }

    if (intent.mood === 'luxury' || intent.family === 'editorial') {
      profile.trackingHero = -0.02;
      profile.trackingMetadata = 0.15;
      profile.lineHeightMultiplier = 0.85;
      profile.capitalizationRule = 'force_uppercase';
    } else if (intent.energy === 'bold') {
      profile.trackingHero = -0.05;
      profile.lineHeightMultiplier = 0.75;
      profile.capitalizationRule = 'force_lowercase';
    }

    if (intent.whitespace === 'airy' || intent.whitespace === 'luxury') {
      profile.negativeSpaceMultiplier = 1.8;
    } else if (intent.whitespace === 'tight') {
      profile.negativeSpaceMultiplier = 0.5;
    }

    if (intent.visualPriority === 'image_hero') {
      profile.cropIntent = 'environmental_wide';
      profile.imageBleedExtent = 'full';
      profile.secondaryTextOpacity = 0.7;
    } else {
      profile.cropIntent = 'tight_macro';
      profile.imageBleedExtent = 'asymmetrical_65';
    }

    if (intent.readingFlow === 'z_pattern') {
      profile.elementOverlapAllowed = true;
    }

    if (intent.mood === 'minimalist' || intent.mood === 'clinical') {
      profile.captionBarStyling = 'none';
      profile.dividerStrokeWeight = 0.5;
    } else {
      profile.captionBarStyling = 'floating_pill';
      profile.dividerStrokeWeight = 2.0;
    }

    return profile;
  }

  // ==========================================
  // SPRINT 4: VISUAL RECIPE GENERATOR
  // ==========================================

  public generateVisualRecipe(intent: IDesignIntent, themeId: string): VisualRecipe {
    const isPop = themeId.includes('pop') || themeId.includes('vibrant');
    const isLuxury = themeId.includes('beauty') || themeId.includes('luxury') || intent.mood === 'luxury';
    const isOrganic = themeId.includes('organic') || themeId.includes('wellness') || intent.mood === 'organic';
    const isClinical = themeId.includes('clinical') || themeId.includes('medical') || intent.mood === 'clinical';

    const isBold = intent.energy === 'bold' || isPop;

    const color: ColorRecipe = {
      surfaceDominance: 'light',
      contrastPreference: 'soft_minimal',
      warmth: 'neutral',
      accentStrategy: 'minimal',
      depth: 'flat',
      dominanceRatios: { primary: 70, secondary: 20, accent: 10 }
    };

    const primitive: PrimitiveRecipe = {
      cardStyle: intent.primitives.cards,
      borderStyle: 'none'
    };

    const texture: TextureRecipe = {
      style: 'none',
      intensity: intent.primitives.textureIntensity === 'none' ? 'subtle' : intent.primitives.textureIntensity
    };

    const typography: TypographyRecipe = {
      hierarchy: 'minimal',
      dominance: 'medium'
    };

    const hero: HeroRecipe = {
      focalPoint: 'photography'
    };

    // 1. Map Color & Depth (Rule-Based, Not Family-Based)
    if (intent.whitespace === 'luxury' || isBold) {
      color.surfaceDominance = 'dark';
      color.contrastPreference = 'high_impact';
      color.depth = isLuxury ? 'layered' : 'flat';
      color.dominanceRatios = { primary: 80, secondary: 15, accent: 5 };
    } else if (intent.whitespace === 'airy') {
      color.surfaceDominance = 'light';
      color.contrastPreference = 'high_impact';
      color.depth = 'editorial';
      color.dominanceRatios = { primary: 85, secondary: 10, accent: 5 };
    } else if (isClinical) {
      color.surfaceDominance = 'light';
      color.contrastPreference = 'soft_minimal';
      color.depth = 'flat';
      color.dominanceRatios = { primary: 90, secondary: 8, accent: 2 };
    }

    // 2. Map Warmth & Texture (Texture is now purely driven by semantic intent)
    if (isLuxury || isOrganic) {
      color.warmth = 'warm';
    } else if (isClinical) {
      color.warmth = 'cool';
    }

    if (intent.primitives.textureIntensity === 'heavy') {
      texture.style = isOrganic ? 'paper' : 'grain';
      texture.intensity = 'heavy';
    } else if (intent.primitives.textureIntensity === 'subtle' || intent.primitives.textureIntensity === 'medium') {
      texture.style = 'linen';
      texture.intensity = intent.primitives.textureIntensity;
    } else {
      texture.style = 'none';
      texture.intensity = 'subtle'; // fallback value for type safety, style 'none' overrides
    }

    // 3. Map Primitives (Cards & Borders)
    if (intent.primitives.cards === 'solid') {
      primitive.borderStyle = isClinical ? 'thin' : 'none';
    } else if (intent.primitives.cards === 'outlined') {
      primitive.borderStyle = 'architectural';
    } else if (intent.primitives.cards === 'glass') {
      primitive.borderStyle = 'none';
    }

    // 4. Map Accent Strategy
    if (intent.visualPriority === 'cta_hero' || isPop) {
      color.accentStrategy = 'dominant';
      color.dominanceRatios.accent = 20;
    } else {
      color.accentStrategy = 'minimal';
    }

    // 5. Map Hero & Typography (Dominance!)
    if (intent.visualPriority === 'typography_hero') {
      hero.focalPoint = 'typography';
      typography.dominance = 'high';
      typography.hierarchy = isBold ? 'bold' : 'editorial';
    } else if (intent.visualPriority === 'image_hero') {
      hero.focalPoint = 'photography';
      typography.dominance = 'low';
    } else if (intent.visualPriority === 'cta_hero') {
      hero.focalPoint = 'typography';
      typography.dominance = 'high';
      typography.hierarchy = 'bold';
    }

    return { color, typography, primitive, texture, hero };
  }
}
