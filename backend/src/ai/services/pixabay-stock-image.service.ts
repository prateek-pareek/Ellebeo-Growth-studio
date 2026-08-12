// ============================================================================
// pixabay-stock-image.service.ts — Royalty-Free Stock Image Search
// Sibling to pixabay-music.service.ts (same provider, different endpoint).
// Used by the slideshow/reels AssetProviders to fill scenes the technician
// didn't supply an image for.
// ============================================================================

import fetch from 'node-fetch';
import { AI_CONFIG } from '../../config/ai.config';

export interface StockImage {
  id: string;
  url: string;
  tags: string[];
}

interface PixabayImageResponse {
  totalHits: number;
  hits: Array<{
    id: number;
    tags: string;
    largeImageURL: string;
  }>;
}

export class PixabayStockImageService {
  private readonly apiKey: string;

  constructor() {
    this.apiKey = process.env['PIXABAY_API_KEY'] ?? '';
  }

  async search(query: string): Promise<StockImage | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_CONFIG.timeouts.pixabayMusic);

    try {
      const url = `https://pixabay.com/api/?key=${this.apiKey}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&safesearch=true&per_page=10`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) return null;

      const data = await response.json() as PixabayImageResponse;
      const hits = data.hits ?? [];
      if (hits.length === 0) return null;

      const selected = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
      if (!selected) return null;

      return {
        id: String(selected.id),
        url: selected.largeImageURL,
        tags: selected.tags.split(',').map((t) => t.trim()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}

export class PixabayStockImageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PixabayStockImageError';
  }
}
