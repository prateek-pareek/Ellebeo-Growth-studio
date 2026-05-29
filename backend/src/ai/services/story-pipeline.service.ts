// ============================================================================
// story-pipeline.service.ts — Generates 4 story frame URLs via Cloudinary
// ============================================================================

import { v2 as cloudinary } from 'cloudinary';
import type { StoryFrameConcept } from '../chains/story-frame.chain';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key:    process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

export interface StoryFrame {
  url: string;
  title: string;  // e.g. "Frame 1 · The chair, empty"
  label: string;  // e.g. "FRAME 01"
}

export interface StoryOutput {
  type: 'story';
  frames: StoryFrame[];
}

export class StoryPipelineService {

  generate(params: {
    cloudinaryPublicId: string;
    brandColour: string;
    concepts: StoryFrameConcept[];
  }): StoryOutput {
    const { cloudinaryPublicId, brandColour, concepts } = params;
    const hex = brandColour.replace('#', '') || '1a1a1a';

    const safe = (text: string, max: number) =>
      text.slice(0, max).replace(/[,\/\\]/g, ' ').replace(/\s+/g, ' ').trim();

    const frames: StoryFrame[] = concepts.map((concept, i) => {
      const isLast = i === concepts.length - 1;

      const url = isLast
        ? cloudinary.url(cloudinaryPublicId, {
            transformation: [
              { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' },
              {
                overlay: { font_family: 'Montserrat', font_size: 54, font_weight: 'bold', text_align: 'center', text: safe(concept.overlayText, 50) },
                color: `#${hex}`,
                background: 'rgb:ffffffcc',
                gravity: 'center',
                width: 1080,
                crop: 'fit',
                flags: 'text_no_trim',
              },
              { quality: 'auto', fetch_format: 'auto' },
            ],
            secure: true,
          })
        : cloudinary.url(cloudinaryPublicId, {
            transformation: [
              { width: 1080, height: 1920, crop: 'fill', gravity: 'auto' },
              {
                overlay: { font_family: 'Montserrat', font_size: 48, font_weight: 'bold', text_align: 'center', text: safe(concept.overlayText, 50) },
                color: '#ffffff',
                background: 'rgb:000000b0',
                gravity: 'south',
                y: 140,
                width: 1080,
                crop: 'fit',
                flags: 'text_no_trim',
              },
              { quality: 'auto', fetch_format: 'auto' },
            ],
            secure: true,
          });

      return {
        url,
        title: concept.title,
        label: `FRAME ${String(concept.index).padStart(2, '0')}`,
      };
    });

    return { type: 'story', frames };
  }
}
