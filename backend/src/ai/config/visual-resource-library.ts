export interface VisualResource {
  id: string;
  category: 'texture' | 'mockup' | 'lighting' | 'frame';
  mood: string[]; // e.g., 'luxury', 'minimal', 'clinical', 'spa'
  brightness: 'light' | 'dark' | 'neutral';
  supports: string[]; // e.g., 'beauty', 'wellness', 'architectural'
  assetUrl: string; // The CDN URL or base64 data URI of the asset
  blendMode?: string; // e.g. 'multiply', 'overlay', 'screen'
}

export const VISUAL_RESOURCE_LIBRARY: VisualResource[] = [
  {
    id: "luxury_marble_slab",
    category: "texture",
    mood: ["luxury", "spa", "premium beauty"],
    brightness: "light",
    supports: ["beauty", "wellness"],
    assetUrl: "https://images.unsplash.com/photo-1549490349-8643362247b5?w=1200&q=80",
    blendMode: "multiply"
  },
  {
    id: "clinical_frosted_glass",
    category: "texture",
    mood: ["clinical", "minimalist", "technical"],
    brightness: "light",
    supports: ["medical_aesthetics", "dental"],
    assetUrl: "https://images.unsplash.com/photo-1510525009512-ad7fc13eefab?w=1200&q=80",
    blendMode: "overlay"
  },
  {
    id: "warm_sandstone",
    category: "texture",
    mood: ["organic", "wellness", "warm"],
    brightness: "neutral",
    supports: ["wellness", "skincare"],
    assetUrl: "C:/Users/pavan/.gemini/antigravity-ide/brain/b3ce4c5b-3ec1-4ea3-8d95-264a8c169bfb/texture_sandstone_1784696423756.png",
    blendMode: "multiply"
  },
  {
    id: "dark_slate_editorial",
    category: "texture",
    mood: ["editorial", "moody", "high fashion"],
    brightness: "dark",
    supports: ["beauty", "hair"],
    assetUrl: "C:/Users/pavan/.gemini/antigravity-ide/brain/b3ce4c5b-3ec1-4ea3-8d95-264a8c169bfb/texture_slate_1784696437960.png",
    blendMode: "multiply"
  },
  {
    id: "soft_window_light",
    category: "lighting",
    mood: ["luxury", "organic", "soft"],
    brightness: "light",
    supports: ["beauty", "wellness", "medical_aesthetics"],
    assetUrl: "C:/Users/pavan/.gemini/antigravity-ide/brain/b3ce4c5b-3ec1-4ea3-8d95-264a8c169bfb/texture_window_light_1784696489950.png",
    blendMode: "screen"
  }
];

export class VisualResourceEngine {
  /**
   * Selects the most appropriate visual asset based on semantic design intent.
   */
  resolveAsset(category: 'texture' | 'mockup' | 'lighting' | 'frame', mood: string): VisualResource | null {
    const candidates = VISUAL_RESOURCE_LIBRARY.filter(r => r.category === category);
    
    if (candidates.length === 0) return null;

    // Sort by exact mood match, then fallback to random in category
    const exactMatches = candidates.filter(r => r.mood.some(m => mood.includes(m) || m.includes(mood)));
    
    if (exactMatches.length > 0) {
      return exactMatches[Math.floor(Math.random() * exactMatches.length)];
    }

    return candidates[Math.floor(Math.random() * candidates.length)];
  }
}
