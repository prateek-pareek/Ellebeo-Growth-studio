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
        // Cover slide: dark overlay + bold hook at bottom
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            { effect: 'brightness:-50' },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 56,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 55),
              },
              color: '#ffffff',
              gravity: 'south',
              y: 120,
              width: 900,
              crop: 'fit',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          secure: true,
        });
      } else if (isLast) {
        // CTA slide: branded colour text centred
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            { effect: 'brightness:-35' },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 52,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 55),
              },
              color: `#${hex}`,
              gravity: 'center',
              width: 900,
              crop: 'fit',
            },
            { quality: 'auto', fetch_format: 'auto' },
          ],
          secure: true,
        });
      } else {
        // Body slides: lighter overlay, text at bottom
        url = cloudinary.url(cloudinaryPublicId, {
          transformation: [
            { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
            { effect: 'brightness:-20' },
            {
              overlay: {
                font_family: 'Montserrat',
                font_size: 46,
                font_weight: 'bold',
                text_align: 'center',
                text: safe(concept.overlayText, 55),
              },
              color: '#ffffff',
              gravity: 'south',
              y: 80,
              width: 900,
              crop: 'fit',
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
