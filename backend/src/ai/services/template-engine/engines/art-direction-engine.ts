import designKnowledgeMap from '../../../config/design-knowledge-map.json';

// ─── 1. INTERFACES ───

export interface IDesignIntent {
  visualPriority: 'typography_hero' | 'image_hero' | 'equal_balance' | 'whitespace_hero';
  storytellingStyle: 'loud_and_bold' | 'quiet_and_minimal' | 'playful_and_layered';
  imageRole: 'environmental' | 'focal_subject' | 'texture_only' | 'none';
  whitespaceMood: 'expansive' | 'structured' | 'dense';
  typographyPhilosophy: 'editorial_contrast' | 'brutalist_scale' | 'classic_balance';
  readingJourney: 'z_pattern' | 'center_down' | 'asymmetrical_flow';
}

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
   * Generates Semantic Design Intent from knowledge tags
   */
  public generateDesignIntent(layoutId: string): IDesignIntent {
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
    } else if (baseId.startsWith('split')) {
      energy = 'structured';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern'; // photo and text occupy distinct halves/bands, eye moves between them
      foundKnowledge = true;
    } else if (baseId.startsWith('countdown_promo')) {
      energy = 'bold';
      balance = 'asymmetrical';
      readingFlow = 'z_pattern'; // urgency-driven layouts favor a punchy, directional read
      foundKnowledge = true;
    } else if (baseId.startsWith('product_showcase')) {
      energy = 'calm';
      balance = 'symmetrical'; // product-hero layouts are centered/balanced around the subject
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId.startsWith('clinical')) {
      energy = 'structured';
      balance = 'symmetrical'; // Clinical needs high alignment
      readingFlow = 'center_down';
      foundKnowledge = true;
    } else if (baseId.startsWith('educational')) {
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
    
    if (foundKnowledge) {
      console.log(`[ArtDirectionEngine] Extracted Semantic Tags for ${layoutId}:`, { family, energy, balance, readingFlow });
    } else {
      console.warn(`[ArtDirectionEngine] No knowledge found for ${layoutId}. Falling back to default.`);
    }

    const isAggressive = energy.includes('bold') || energy.includes('aggressive') || energy.includes('high');
    const isQuiet = energy.includes('quiet') || energy.includes('calm') || energy.includes('minimal');
    const isAsymmetrical = balance === 'asymmetrical' || readingFlow.includes('z');

    return {
      visualPriority: isAggressive ? 'typography_hero' : (isQuiet ? 'whitespace_hero' : 'image_hero'),
      storytellingStyle: isQuiet ? 'quiet_and_minimal' : (isAggressive ? 'loud_and_bold' : 'playful_and_layered'),
      imageRole: isAsymmetrical ? 'focal_subject' : 'environmental',
      whitespaceMood: isQuiet ? 'expansive' : (isAggressive ? 'dense' : 'structured'),
      typographyPhilosophy: isAggressive ? 'brutalist_scale' : 'editorial_contrast',
      readingJourney: isAsymmetrical ? 'z_pattern' : 'center_down'
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
    } else if (intent.visualPriority === 'whitespace_hero') {
      profile.heroBaseFontSize = 72;
      profile.metadataBaseFontSize = 18;
      profile.bodyBaseFontSize = 22;
      profile.marginHugging = false;
    } else {
      profile.heroBaseFontSize = 100;
    }

    if (intent.typographyPhilosophy === 'editorial_contrast') {
      profile.trackingHero = -0.02; 
      profile.trackingMetadata = 0.15; 
      profile.lineHeightMultiplier = 0.85;
      profile.capitalizationRule = 'force_uppercase';
    } else if (intent.typographyPhilosophy === 'brutalist_scale') {
      profile.trackingHero = -0.05;
      profile.lineHeightMultiplier = 0.75;
      profile.capitalizationRule = 'force_lowercase';
    }

    if (intent.whitespaceMood === 'expansive') {
      profile.negativeSpaceMultiplier = 1.8;
    } else if (intent.whitespaceMood === 'dense') {
      profile.negativeSpaceMultiplier = 0.5;
    }

    if (intent.imageRole === 'environmental') {
      profile.cropIntent = 'environmental_wide';
      profile.imageBleedExtent = 'full';
      profile.secondaryTextOpacity = 0.7;
    } else if (intent.imageRole === 'focal_subject') {
      profile.cropIntent = 'tight_macro';
      profile.imageBleedExtent = 'asymmetrical_65';
    }

    if (intent.readingJourney === 'z_pattern') {
      profile.elementOverlapAllowed = true;
    }

    if (intent.storytellingStyle === 'quiet_and_minimal') {
      profile.captionBarStyling = 'none';
      profile.dividerStrokeWeight = 0.5;
    } else {
      profile.captionBarStyling = 'floating_pill';
      profile.dividerStrokeWeight = 2.0;
    }

    return profile;
  }
}
