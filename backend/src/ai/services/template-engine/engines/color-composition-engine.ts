export interface ColorPalette {
  brandColor: string;
  secondaryColor: string;
  backgroundColor: string;
  accentColor?: string;
  depthColor?: string;
  textColor?: string;
}

export interface ColorHierarchy {
  primaryBackground: string;
  secondaryBackground: string;
  cardSurface: string;
  accent: string;
  highlight: string;
  primaryText: string;
  secondaryText: string;
  ctaSurface: string;
  border: string;
  divider: string;
  dominanceRatios?: { primary: number; secondary: number; accent: number };
}

import { ColorRecipe } from '../interfaces';

export class ColorCompositionEngine {
  /**
   * Translates a flat set of valid colors into a strict 10-role semantic hierarchy.
   */
  public resolveHierarchy(palette: ColorPalette, recipe: ColorRecipe): ColorHierarchy {
    const bgOrig = this.cleanHex(palette.backgroundColor || '#F9F6F3');
    const secOrig = this.cleanHex(palette.secondaryColor || '#F6EEE4');
    const brandOrig = this.cleanHex(palette.brandColor || '#CBBFB1');
    const textOrig = this.cleanHex(palette.textColor || '#393939');
    const accentOrig = this.cleanHex(palette.accentColor || brandOrig);
    const depthOrig = this.cleanHex(palette.depthColor || '#111111');

    // 1. Process Premium Whites / Warmth
    let bg = bgOrig;
    let sec = secOrig;
    let card = '#FFFFFF';

    if (recipe.warmth === 'warm') {
      if (this.isWhite(bg)) bg = '#FDFCF8'; // Warm white
      if (this.isWhite(sec)) sec = '#F6F4EE';
      card = '#FCFBF8'; // Warm premium card
    } else if (recipe.warmth === 'cool') {
      if (this.isWhite(bg)) bg = '#F8F9FA'; // Cool white
      if (this.isWhite(sec)) sec = '#F1F3F5';
      card = '#FFFFFF'; // Crisp white
    }

    // 2. Resolve Surface Dominance (The 70%)
    let primaryBackground = bg;
    let secondaryBackground = sec;
    let cardSurface = card;

    if (recipe.surfaceDominance === 'dark') {
      primaryBackground = recipe.depth === 'layered' ? depthOrig : textOrig;
      secondaryBackground = depthOrig;
      cardSurface = recipe.contrastPreference === 'high_impact' ? bg : brandOrig;
    } else if (recipe.surfaceDominance === 'brand_heavy') {
      primaryBackground = brandOrig;
      secondaryBackground = bg;
      cardSurface = recipe.contrastPreference === 'high_impact' ? '#FFFFFF' : sec;
    }

    // 3. Resolve Accent Strategy (The 10%)
    let accent = accentOrig;
    if (recipe.accentStrategy === 'minimal') {
      accent = brandOrig; // Muted accent
    } else if (recipe.accentStrategy === 'dominant') {
      accent = textOrig; // Stark, heavy accent
    }

    // 4. Mathematical Auto-Contrast for Typography
    const primaryLuminance = this.getLuminance(primaryBackground);
    const cardLuminance = this.getLuminance(cardSurface);

    // Primary Text lives on Cards or Secondary Surfaces usually
    // If the card is light, text must be dark. If card is dark, text must be light.
    const primaryText = cardLuminance > 0.5 ? depthOrig : (recipe.warmth === 'warm' ? '#FCFBF8' : '#FFFFFF');
    const secondaryText = cardLuminance > 0.5 ? textOrig : brandOrig;

    // 5. Build Hierarchy
    return {
      primaryBackground,
      secondaryBackground,
      cardSurface,
      accent,
      highlight: sec,
      primaryText,
      secondaryText,
      ctaSurface: accent,
      border: primaryLuminance > 0.5 ? textOrig : brandOrig,
      divider: primaryLuminance > 0.5 ? textOrig : brandOrig,
      dominanceRatios: recipe.dominanceRatios
    };
  }

  private cleanHex(hex: string): string {
    if (hex.length === 4) {
      return '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
    }
    return hex;
  }

  private getLuminance(hex: string): number {
    const c = hex.substring(1);      
    const rgb = parseInt(c, 16);   
    const r = (rgb >> 16) & 0xff;  
    const g = (rgb >>  8) & 0xff;  
    const b = (rgb >>  0) & 0xff;  
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  }

  private isWhite(hex: string): boolean {
    return hex.toUpperCase() === '#FFFFFF' || this.getLuminance(hex) > 0.95;
  }
}
