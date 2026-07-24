import type { VisualStyleId } from '../../../config/visual-style-library';

export interface DesignTokens {
  spacing: 'airy' | 'dense' | 'balanced';
  borderRadius: 'sharp' | 'soft' | 'pill';
  shadowDepth: 'none' | 'soft' | 'medium' | 'high';
  layerDepth: 'flat' | 'moderate' | 'high';
  headlinePresence: 'hero' | 'secondary' | 'subtle';
  decorationDensity: 'minimal' | 'medium' | 'heavy';
  contrast: 'soft' | 'medium' | 'high';
}

export class ThemeEngine {
  private styleTokensMap: Record<VisualStyleId, DesignTokens> = {
    quiet_luxury: {
      spacing: 'airy', borderRadius: 'sharp', shadowDepth: 'none', layerDepth: 'flat',
      headlinePresence: 'subtle', decorationDensity: 'minimal', contrast: 'soft'
    },
    editorial_beauty: {
      spacing: 'airy', borderRadius: 'sharp', shadowDepth: 'soft', layerDepth: 'flat',
      headlinePresence: 'secondary', decorationDensity: 'minimal', contrast: 'high'
    },
    clinical_minimalist: {
      spacing: 'airy', borderRadius: 'sharp', shadowDepth: 'none', layerDepth: 'flat',
      headlinePresence: 'secondary', decorationDensity: 'minimal', contrast: 'medium'
    },
    warm_wellness: {
      spacing: 'balanced', borderRadius: 'soft', shadowDepth: 'soft', layerDepth: 'moderate',
      headlinePresence: 'secondary', decorationDensity: 'medium', contrast: 'soft'
    },
    high_fashion: {
      spacing: 'airy', borderRadius: 'sharp', shadowDepth: 'medium', layerDepth: 'flat',
      headlinePresence: 'hero', decorationDensity: 'minimal', contrast: 'high'
    },
    polished_commercial: {
      spacing: 'balanced', borderRadius: 'soft', shadowDepth: 'medium', layerDepth: 'moderate',
      headlinePresence: 'hero', decorationDensity: 'medium', contrast: 'medium'
    },
    soft_feminine: {
      spacing: 'airy', borderRadius: 'soft', shadowDepth: 'soft', layerDepth: 'moderate',
      headlinePresence: 'secondary', decorationDensity: 'medium', contrast: 'soft'
    },
    bold_campaign: {
      spacing: 'dense', borderRadius: 'sharp', shadowDepth: 'none', layerDepth: 'high',
      headlinePresence: 'hero', decorationDensity: 'heavy', contrast: 'high'
    },
    natural_organic: {
      spacing: 'balanced', borderRadius: 'soft', shadowDepth: 'none', layerDepth: 'flat',
      headlinePresence: 'subtle', decorationDensity: 'minimal', contrast: 'medium'
    },
    contemporary_cool: {
      spacing: 'airy', borderRadius: 'sharp', shadowDepth: 'medium', layerDepth: 'high',
      headlinePresence: 'secondary', decorationDensity: 'minimal', contrast: 'high'
    }
  };

  private styleDecorationMap: Record<VisualStyleId, string> = {
    quiet_luxury: 'gold_accents',
    editorial_beauty: 'gallery_frame',
    clinical_minimalist: 'gallery_frame',
    warm_wellness: 'masking_tape',
    high_fashion: 'wax_seal',
    polished_commercial: 'status_chip',
    soft_feminine: '3d_ribbon',
    bold_campaign: 'divider',
    natural_organic: 'ticket_notches',
    contemporary_cool: 'film_sprockets',
  };

  /**
   * Resolves the default primitive decoration based on the brand's visual ranking.
   */
  public resolveStyleDecoration(visualRanking?: string[]): string | null {
    const primaryStyle = visualRanking?.[0] as VisualStyleId | undefined;
    if (primaryStyle && this.styleDecorationMap[primaryStyle]) {
      return this.styleDecorationMap[primaryStyle];
    }
    return null;
  }

  /**
   * Resolves the Design Tokens based on the brand's visual ranking.
   */
  public resolveDesignTokens(visualRanking?: string[]): DesignTokens {
    const primaryStyle = visualRanking?.[0] as VisualStyleId | undefined;
    if (primaryStyle && this.styleTokensMap[primaryStyle]) {
      return this.styleTokensMap[primaryStyle];
    }
    // Default fallback tokens (e.g. for Polished Commercial / standard engagement)
    return {
      spacing: 'balanced',
      borderRadius: 'soft',
      shadowDepth: 'medium',
      layerDepth: 'moderate',
      headlinePresence: 'secondary',
      decorationDensity: 'medium',
      contrast: 'medium'
    };
  }

  /**
   * Generates global SVG <defs> for complex filters, noise, and lighting effects.
   */
  public generateGlobalDefs(validBrandColor: string, validSecondaryColor: string): string {
    return `
      <defs>
        <!-- Glassmorphism Filter -->
        <filter id="glass-blur" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="15" result="blur" />
          <feColorMatrix type="matrix" values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 18 -7" result="glow" />
          <feBlend in="SourceGraphic" in2="glow" mode="normal" />
        </filter>

        <!-- Organic Shadow -->
        <filter id="organic-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000000" flood-opacity="0.15" />
        </filter>

        <!-- Premium Shadow (used by typography and UI components) -->
        <filter id="premium_shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="15" stdDeviation="25" flood-color="#000000" flood-opacity="0.15" />
        </filter>

        <!-- Foil Stamp / Metallic Reflection -->
        <linearGradient id="foil-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${validSecondaryColor}" stop-opacity="0.8" />
          <stop offset="30%" stop-color="#FFFFFF" stop-opacity="0.9" />
          <stop offset="70%" stop-color="${validBrandColor}" stop-opacity="0.7" />
          <stop offset="100%" stop-color="${validSecondaryColor}" stop-opacity="1" />
        </linearGradient>

        <!-- Solid Background for Label Maker Effect -->
        <filter id="solid_bg" x="-10%" y="0" width="120%" height="100%">
          <feFlood flood-color="${validBrandColor}" result="bg" />
          <feMerge>
            <feMergeNode in="bg"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        
        <filter id="solid_bg_secondary" x="-10%" y="0" width="120%" height="100%">
          <feFlood flood-color="${validSecondaryColor}" result="bg" />
          <feMerge>
            <feMergeNode in="bg"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>

        <!-- Noise Texture -->
        <filter id="noise-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/>
          <feColorMatrix type="matrix" values="1 0 0 0 0, 0 1 0 0 0, 0 0 1 0 0, 0 0 0 0.08 0" />
        </filter>
      </defs>
    `;
  }

  /**
   * Generates a full-canvas overlay for global film grain or lighting if needed.
   */
  public generateGlobalOverlay(w: number, h: number): string {
    return '';
  }
}
