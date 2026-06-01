// ============================================================================
// logo-overlay.service.ts — Overlays technician logo on AI-generated images
// Uses Cloudinary's overlay transformation. Non-fatal — if logo fails,
// returns the original image URL unchanged.
// ============================================================================

import { v2 as cloudinary } from 'cloudinary';

cloudinary.config({
  cloud_name: process.env['CLOUDINARY_CLOUD_NAME'],
  api_key:    process.env['CLOUDINARY_API_KEY'],
  api_secret: process.env['CLOUDINARY_API_SECRET'],
  secure: true,
});

type LogoPosition = 'bottom_right' | 'bottom_left' | 'top_right' | 'top_left';

const GRAVITY_MAP: Record<LogoPosition, string> = {
  bottom_right: 'south_east',
  bottom_left:  'south_west',
  top_right:    'north_east',
  top_left:     'north_west',
};

export class LogoOverlayService {

  async applyLogo(params: {
    imageUrl: string;
    logoUrl: string;
    position?: LogoPosition;
    tenantId: string;
  }): Promise<string> {
    const { imageUrl, logoUrl, position = 'bottom_right', tenantId } = params;

    if (!process.env['CLOUDINARY_CLOUD_NAME']) return imageUrl;

    try {
      // Upload the base image to Cloudinary first
      const baseUpload = await cloudinary.uploader.upload(imageUrl, {
        folder: `growthstudio/${tenantId}/generated`,
        resource_type: 'image',
      });

      // Upload the logo to Cloudinary (cache it)
      const logoUpload = await cloudinary.uploader.upload(logoUrl, {
        folder: `growthstudio/${tenantId}/logos`,
        resource_type: 'image',
        public_id: `logo_${tenantId}`,
        overwrite: false,
      });

      const gravity = GRAVITY_MAP[position] || 'south_east';

      // Generate final URL with logo overlay
      const finalUrl = cloudinary.url(baseUpload.public_id, {
        transformation: [
          { width: 1024, height: 1024, crop: 'fill' },
          {
            overlay: logoUpload.public_id.replace(/\//g, ':'),
            width: 120,
            gravity,
            x: 20,
            y: 20,
            opacity: 90,
            crop: 'fit',
          },
          { quality: 'auto', fetch_format: 'auto' },
        ],
        secure: true,
      });

      return finalUrl;
    } catch (err) {
      console.warn('[LogoOverlay] Failed, returning original image:', (err as Error).message);
      return imageUrl;
    }
  }
}
