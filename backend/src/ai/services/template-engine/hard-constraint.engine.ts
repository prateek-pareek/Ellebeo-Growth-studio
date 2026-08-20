import { ITemplateCandidate, ITemplateContext } from './interfaces';

export class HardConstraintEngine {
  /**
   * Mathematically filters out templates that cannot physically work for the given context.
   * This is a 100% deterministic stage (no LLM).
   */
  filter(candidates: ITemplateCandidate[], context: ITemplateContext): ITemplateCandidate[] {
    return candidates.filter(template => {
      
      // Constraint 1: Face Safety
      const isMacro = context.visionResult?.framingType === 'macro';
      const isZoomedFace = context.visionResult?.facesDetected && context.visionResult?.framingType === 'portrait';
      if ((isMacro || isZoomedFace) && !template.macroFaceSafe) {
        return false; // Eliminate if we have a zoomed face but the layout chops faces
      }

      // Constraint 2: Text Requirements
      if (context.textLength === 0 && template.requiresText) {
        return false; // Eliminate if it requires text but we have none
      }

      // Constraint 3: Text Overflow Prevention
      if (context.textLength > 200 && template.textDensity === 'low') {
        return false; // Eliminate if we have massive text but a low density layout
      }

      // Constraint 4: Collision Avoidance (Vision Agent Integration)
      if (context.visionResult?.faceCoordinates && context.visionResult?.facesDetected) {
        const { eyesYPercent, mouthYPercent } = context.visionResult.faceCoordinates;
        
        // Define the critical face zone (with a 10% padding for safety)
        const faceMinY = Math.max(0, eyesYPercent - 10);
        const faceMaxY = Math.min(100, mouthYPercent + 10);
        
        let collisionDetected = false;
        
        for (const zone of template.occupiedTextZones) {
          // Check for overlap between zone [yMin, yMax] and face [faceMinY, faceMaxY]
          if (zone.yMinPercent < faceMaxY && zone.yMaxPercent > faceMinY) {
            collisionDetected = true;
            break;
          }
        }
        
        // Eliminate template if text layout would cover the client's face
        if (collisionDetected) {
          return false; 
        }
      }

      return true; // Template survived hard constraints
    });
  }
}
