// ============================================================================
// pixabay-music.service.ts — Royalty-Free Music Selection by Brand Mood
// Results cached in Redis for 7 days per technician to avoid redundant calls
// ============================================================================

import fetch from 'node-fetch';
import type Redis from 'ioredis';
import { AI_CONFIG } from '../../config/ai.config';
import type { MusicTrack } from '../types/chain-output.types';
import type { BrandMoodTag } from '../types/job-payload.types';

interface PixabayMusicResponse {
  totalHits: number;
  hits: Array<{
    id: number;
    title: string;
    user: string;
    duration: number;
    audio: string;
    tags: string;
  }>;
}

// Mood tag → Pixabay search query mapping
const MOOD_TO_QUERY: Record<BrandMoodTag, string> = {
  luxury: 'elegant classical soft',
  upbeat: 'upbeat pop positive',
  chill: 'ambient chill relaxing',
  elegant: 'elegant soft piano',
  bold: 'energetic powerful modern',
  clinical: 'corporate professional clean',
  warm: 'acoustic warm gentle',
  playful: 'fun playful light',
};

export class PixabayMusicService {
  private readonly apiKey: string;

  constructor(private readonly redis: Redis) {
    this.apiKey = process.env['PIXABAY_API_KEY'] ?? '';
  }

  async selectTrack(tenantId: string, moodTag: BrandMoodTag): Promise<MusicTrack | null> {
    // Check Redis cache first (7 days per technician)
    const cacheKey = AI_CONFIG.redisKeys.musicTrack(tenantId);
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      return JSON.parse(cached) as MusicTrack;
    }

    // Fetch from Pixabay
    const query = MOOD_TO_QUERY[moodTag] ?? 'soft background music';
    const track = await this.fetchFromPixabay(query);

    if (track) {
      // Cache for 7 days
      await this.redis.set(cacheKey, JSON.stringify(track), 'EX', AI_CONFIG.cache.musicTrackTTL);
    }

    return track;
  }

  private async fetchFromPixabay(query: string): Promise<MusicTrack | null> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AI_CONFIG.timeouts.pixabayMusic);

    try {
      const url = `https://pixabay.com/api/videos/music/?key=${this.apiKey}&q=${encodeURIComponent(query)}&per_page=10`;
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) return null;

      const data = await response.json() as PixabayMusicResponse;
      const hits = data.hits ?? [];

      if (hits.length === 0) return null;

      // Select a random track from the top 10 results for variety
      const selected = hits[Math.floor(Math.random() * Math.min(hits.length, 5))];
      if (!selected) return null;

      return {
        trackId: String(selected.id),
        title: selected.title,
        artist: selected.user,
        durationSeconds: selected.duration,
        cdnUrl: selected.audio,
        moodTags: selected.tags.split(',').map((t) => t.trim()),
      };
    } finally {
      clearTimeout(timeout);
    }
  }
}
