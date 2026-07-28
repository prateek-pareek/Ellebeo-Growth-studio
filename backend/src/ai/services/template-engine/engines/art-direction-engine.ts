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
  heroScaleRatio: number;
  metadataScaleRatio: number;
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
    const knowledge = (designKnowledgeMap as any)[layoutId];
    
    // Default semantic tags
    let family = 'editorial';
    let energy = 'calm';
    let balance = 'symmetrical';
    let readingFlow = 'center_anchored';
    
    if (knowledge) {
      family = knowledge.layoutFamily?.value || family;
      energy = knowledge.visualLanguage?.energy || energy;
      balance = knowledge.composition?.balance || balance;
      readingFlow = knowledge.composition?.readingFlow || readingFlow;
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
      heroScaleRatio: 1.0,
      metadataScaleRatio: 0.3,
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
      profile.heroScaleRatio = 2.3;
      profile.metadataScaleRatio = 0.15;
      profile.elementOverlapAllowed = true;
      profile.marginHugging = true;
    } else if (intent.visualPriority === 'whitespace_hero') {
      profile.heroScaleRatio = 0.8;
      profile.metadataScaleRatio = 0.1;
      profile.marginHugging = false;
    } else {
      profile.heroScaleRatio = 1.2;
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
