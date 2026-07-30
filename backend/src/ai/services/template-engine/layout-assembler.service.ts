import { Injectable, Logger } from '@nestjs/common';
import { ICompiledLayoutDSL } from './interfaces';
import { CompositionEngine } from './engines/composition-engine';

@Injectable()
export class LayoutAssemblerService {
  private logger = new Logger(LayoutAssemblerService.name);
  private compositionEngine: CompositionEngine;

  constructor() {
    this.compositionEngine = new CompositionEngine();
  }

  /**
   * Deterministically compiles a Design Family into a CompiledLayoutDSL.
   * PHASE 3: We now use CompositionEngine to generate strict recipes.
   */
  compileFamilyToDSL(familyId: string, slideIndex: number, brandName: string): ICompiledLayoutDSL {
    
    // Instead of randomly selecting backgrounds and masks, we generate a strict recipe
    this.logger.log(`[Layout Assembler] Compiling structural recipe for family: ${familyId}`);
    return this.compositionEngine.buildRecipe(familyId, slideIndex, brandName);
  }
}
