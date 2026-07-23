import { Injectable, Logger } from '@nestjs/common';
import { IDesignFamily, ICompiledLayoutDSL, IDSLSceneLayer } from './interfaces';
import { DESIGN_FAMILIES } from '../../config/design-families.config';
import * as crypto from 'crypto';

@Injectable()
export class LayoutAssemblerService {
  private logger = new Logger(LayoutAssemblerService.name);

  /**
   * Deterministically compiles a Design Family into a CompiledLayoutDSL.
   * We use the slideIndex and brandName as a seed so the same input always yields the same variant.
   */
  compileFamilyToDSL(familyId: string, slideIndex: number, brandName: string): ICompiledLayoutDSL {
    const family = DESIGN_FAMILIES[familyId];
    if (!family) {
      this.logger.warn(`Family ${familyId} not found. Falling back to default.`);
      return this.compileFamilyToDSL('editorial_magazine', slideIndex, brandName);
    }

    // Deterministic seed based on slide index and brand
    const seedStr = `${brandName}_${familyId}_${slideIndex}`;
    const hash = crypto.createHash('md5').update(seedStr).digest('hex');
    const randomInt = parseInt(hash.substring(0, 8), 16);

    // Select random (but deterministic) elements from the family's allowed primitives
    const background = family.allowedBackgrounds[randomInt % Math.max(1, family.allowedBackgrounds.length)] || 'solid_brand';
    
    // Create the layers array
    const layers: IDSLSceneLayer[] = [];

    // Background Layer (We map this conceptually as a decoration or handled by renderer)
    // For now, we will add it to the DSL if needed, or pass it in metadata.
    
    // If the family supports images (masks > 0)
    if (family.allowedMasks && family.allowedMasks.length > 0) {
      const mask = family.allowedMasks[randomInt % family.allowedMasks.length] as any;
      layers.push({
        id: 'main_image',
        type: 'image',
        zIndex: 10,
        mask: mask || 'rectangle',
        paddingPercent: mask === 'full_bleed' ? 0 : 10,
        anchor: 'middle_right'
      });
      
      // Text layer to complement image
      layers.push({
        id: 'main_text',
        type: 'text',
        zIndex: 30,
        anchor: 'middle_left',
        role: 'body',
        alignment: 'left',
        maxWidthPercent: 40
      });
    } else {
      // Text-Only layout (e.g. text_palette_minimal)
      layers.push({
        id: 'hero_text',
        type: 'text',
        zIndex: 30,
        anchor: 'center',
        role: 'heading',
        alignment: 'center',
        maxWidthPercent: 80
      });
    }

    // Add a decoration if allowed
    if (family.allowedDecorations && family.allowedDecorations.length > 0) {
      const deco = family.allowedDecorations[randomInt % family.allowedDecorations.length] as any;
      layers.push({
        id: 'main_decoration',
        type: 'decoration',
        zIndex: 40,
        component: deco,
        anchor: 'top_left',
        offsetPercent: 5
      });
    }

    return {
      schemaVersion: '1.0',
      layoutVersion: '1.0',
      id: `${familyId}_variant_${randomInt % 100}`,
      layers
    };
  }
}
