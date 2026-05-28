// ============================================================================
// carousel-pipeline.service.ts — Generates carousel slide URLs via Cloudinary
// Accepts AI-generated slide concepts (3–5) and produces one Cloudinary URL
// per slide with appropriate text overlays.
// ============================================================================

import { v2 as cloudinary } from 'cloudinary';
import type { CarouselSlideConcept } from '../chains/carousel-concept.chain';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key:    process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

export interface CarouselSlide {
  url: string;
  title: string;  // e.g. "01 · The result revealed" — shown in slide list
  label: string;  // e.g. "SLIDE 01" — shown as overlay badge
}

export interface CarouselSlides {
  type: 'carousel';
  slides: CarouselSlide[];
}

export class CarouselPipelineService {

  generate(params: {
    cloudinaryPublicId: string;
    brandColour: string;
    concepts: CarouselSlideConcept[];
  }): CarouselSlides {
    const { cloudinaryPublicId, brandColour, concepts } = params;
    const hex = brandColour.replace('#', '') || '1a1a1a';

    // Strip characters Cloudinary rejects in text overlays
    const safe = (text: string, max: number) =>
      text
        .slice(0, max)
        .replace(/[,\/\\]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const slides: CarouselSlide[] = concepts.map((concept, i) => {
      const isFirst = i === 0;
      const isLast  = i === concepts.length - 1;

      let url: string;

      if (isFirst) {
        // Cover: natural image + semi-transparent white bar at bottom + bold dark text
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            // White bar at bottom — no color filter on the image
            {
              overlay: { fetch_format: 'auto', public_id: 'white_bar' } as any,
              width: 1080, height: 180,
              gravity: 'south', y: 0,
              opacity: 88,
              flags: 'layer_apply',
            },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 52,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 45),
              },
              color: '#1a1a1a',
              gravity: 'south',
              y: 55,
              width: 960,
              crop: 'fit',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          secure: true,
        });
      } else if (isLast) {
        // CTA: natural image + brand colour bar + white text
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            { effect: 'brightness:-10' },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 48,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 45),
              },
              color: `#${hex}`,
              gravity: 'center',
              y: 0,
              width: 900,
              crop: 'fit',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          secure: true,
        });
      } else {
        // Body slides: natural image, minimal darkening, clean white text bar at bottom
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 44,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 50),
              },
              color: '#ffffff',
              gravity: 'south',
              y: 60,
              width: 900,
              crop: 'fit',
              background: 'rgb:00000066',
              flags: 'text_no_trim',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          secure: true,
        });
      }

      return {
        url,
        title: concept.title,
        label: `SLIDE ${String(concept.index).padStart(2, '0')}`,
      };
    });

    return { type: 'carousel', slides };
  }
}
