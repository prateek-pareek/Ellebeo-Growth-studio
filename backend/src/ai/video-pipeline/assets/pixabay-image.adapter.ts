import { AI_CONFIG } from '../../../config/ai.config';
import type { StockImage, StockImagePort } from './stock-image.port';

interface PixabayImageHit {
  id: number;
  largeImageURL?: string;
  webformatURL?: string;
  tags?: string;
}

interface PixabayImageResponse {
  hits?: PixabayImageHit[];
}

export function createPixabayImageAdapter(opts?: {
  apiKey?: string;
  fetchImpl?: typeof fetch;
}): StockImagePort {
  const apiKey = opts?.apiKey ?? process.env['PIXABAY_API_KEY'] ?? '';
  const fetchImpl = opts?.fetchImpl ?? fetch;

  return {
    async search(query, { count, orientation = 'vertical' }) {
      if (!apiKey) return [];

      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), AI_CONFIG.timeouts.pixabayMusic);
      try {
        const url =
          `https://pixabay.com/api/?key=${encodeURIComponent(apiKey)}` +
          `&q=${encodeURIComponent(query)}` +
          `&image_type=photo&orientation=${orientation}` +
          `&safesearch=true&per_page=${Math.min(20, Math.max(3, count))}`;
        const response = await fetchImpl(url, { signal: controller.signal });
        if (!response.ok) return [];
        const data = (await response.json()) as PixabayImageResponse;
        return (data.hits ?? [])
          .map(toStockImage)
          .filter((hit): hit is StockImage => Boolean(hit))
          .slice(0, count);
      } catch {
        return [];
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}

function toStockImage(hit: PixabayImageHit): StockImage | null {
  const url = hit.largeImageURL || hit.webformatURL;
  if (!url) return null;
  return {
    id: String(hit.id),
    url,
    tags: (hit.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
  };
}
