// ============================================================================
// carousel-pipeline.service.ts — Generates carousel slide URLs via Cloudinary
// Produces 3 slides: hook slide, clean result slide, CTA slide.
// No extra API calls — all transformations are Cloudinary URL-based.
// ============================================================================

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key:    process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

export interface CarouselSlides {
  type: 'carousel';
  slides: string[];     // Cloudinary URLs, ordered Slide 1 → N
}

export class CarouselPipelineService {

  generate(params: {
    cloudinaryPublicId: string;
    hookText: string;
    ctaText: string;
    brandColour: string;   // hex with or without #
  }): CarouselSlides {
    const { cloudinaryPublicId, hookText, ctaText, brandColour } = params;
    const hex = brandColour.replace('#', '') || '1a1a1a';

    // Strip characters Cloudinary rejects in text overlays
    const safe = (text: string, max: number) =>
      text.slice(0, max)
        .replace(/[,\/\\]/g, ' ')   // commas & slashes break Cloudinary URL syntax
        .replace(/\s+/g, ' ')
        .trim();

    // ── Slide 1: Hook ─────────────────────────────────────────────────────────
    // Dark overlay + bold hook sentence at the bottom to grab attention
    const slide1 = cloudinary.url(cloudinaryPublicId, {
      transformation: [
        { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
        { effect: 'brightness:-50' },
        {
          overlay: {
            font_family: 'Montserrat',
            font_size: 58,
            font_weight: 'bold',
            text_align: 'center',
            text: safe(hookText, 60),
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

    // ── Slide 2: Result ───────────────────────────────────────────────────────
    // Clean after-photo — let the result speak for itself
    const slide2 = cloudinary.url(cloudinaryPublicId, {
      transformation: [
        { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
        { quality: 'auto', fetch_format: 'auto' },
      ],
      secure: true,
    });

    // ── Slide 3: CTA ──────────────────────────────────────────────────────────
    // Image + brand-coloured text overlay in centre → drive bookings
    const slide3 = cloudinary.url(cloudinaryPublicId, {
      transformation: [
        { width: 1080, height: 1080, crop: 'fill', gravity: 'auto' },
        { effect: 'brightness:-30' },
        {
          overlay: {
            font_family: 'Montserrat',
            font_size: 50,
            font_weight: 'bold',
            text_align: 'center',
            text: safe(ctaText, 55),
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

    return { type: 'carousel', slides: [slide1, slide2, slide3] };
  }
}
