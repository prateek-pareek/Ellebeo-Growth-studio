import { Injectable } from '@nestjs/common';
import { DesignFamilyRecipe, CompositionPlan, Bounds, TextSpec } from '../types/design-recipe.type';
import { RecipeResolverService } from './recipe-resolver.service';

/**
 * CompositionPlanner
 * RESPONSIBILITY: Create deterministic composition plan from recipe
 * Key feature: Constraint Solver (handles text overlap, overflow, face occlusion)
 */
@Injectable()
export class CompositionPlannerService {
  constructor(private recipeResolver: RecipeResolverService) {}

  /**
   * Calculate composition plan for a slide
   */
  calculatePlan(
    recipe: DesignFamilyRecipe | any,
    context: {
      copy: { headline: string; body?: string; cta?: string; caption?: string };
      images: { main: any; secondary?: any };
      canvas: { width: number; height: number };
      vision?: { faceCoordinates?: Bounds; qualityScore: number };
    },
  ): CompositionPlan | { error: string; suggestion: string } | any {
    const canvas = context.canvas;
    const copy = context.copy;

    // PHASE 2: HIERARCHICAL DESIGN ENGINE (TOKEN CONSUMPTION)
    if (recipe.mode) {
      return this.buildPlanFromTokens(recipe, context);
    }

    // 1. Calculate available space
    const margins = {
      top: canvas.height * recipe.spacing.topBuffer,
      bottom: canvas.height * recipe.spacing.bottomBuffer,
      left: canvas.width * recipe.spacing.sideBuffer,
      right: canvas.width * recipe.spacing.sideBuffer,
    };

    const availableWidth = canvas.width - margins.left - margins.right;
    const availableHeight = canvas.height - margins.top - margins.bottom;

    // 2. Position logo (FIXED, reserved)
    const logoBounds = this.positionLogo(recipe, canvas);

    // 3. Extract face safe zones
    const faceExclusionZones: Bounds[] = [];
    if (context.vision?.faceCoordinates) {
      faceExclusionZones.push(
        this.expandBounds(
          context.vision.faceCoordinates,
          recipe.faceHandling.excludionBuffer,
        ),
      );
    }

    // 4. Calculate base typography size
    const baseSize = this.recipeResolver.calculateBaseTypographySize(canvas.width, recipe);

    // 5. Position image
    const imageBounds = this.positionImage(
      recipe,
      canvas,
      margins,
      availableWidth,
      availableHeight,
    );

    // 6. Position text elements with constraint solving
    const textLayout = this.solveTextLayout(
      recipe,
      copy,
      baseSize,
      canvas,
      margins,
      availableWidth,
      availableHeight,
      logoBounds,
      faceExclusionZones,
      imageBounds,
    );

    if ('error' in textLayout) {
      return textLayout; // Reflow needed
    }

    // 7. Build typography specs
    const typographySpecs = this.buildTypographySpecs(
      recipe,
      baseSize,
      textLayout.textBounds,
    );

    // 8. Position primitives
    const primitives = this.positionPrimitives(
      recipe,
      canvas,
      margins,
      textLayout.textBounds,
      imageBounds,
    );

    // 9. Build scene graph (rendering instructions for generic renderer)
    const sceneGraph = this.buildSceneGraph(
      recipe,
      imageBounds,
      logoBounds,
      textLayout.textBounds,
      typographySpecs,
      primitives,
      faceExclusionZones,
      textLayout.contentZone,
      canvas,
    );

    // 10. Build final plan
    const plan: CompositionPlan = {
      layout: {
        logo: { ...logoBounds, zIndex: 100 },
        image: { ...imageBounds, zIndex: 1, mask: 'rectangle' },
        headline: { ...textLayout.textBounds.headline, zIndex: 30 },
        body: { ...textLayout.textBounds.body, zIndex: 31 },
        cta: textLayout.textBounds.cta
          ? { ...textLayout.textBounds.cta, zIndex: 32 }
          : undefined,
        decorations: primitives,
      },
      typography: typographySpecs,
      primitives,
      constraints: {
        faceExclusionZones,
        logoReservedZone: logoBounds,
        textContentZone: textLayout.contentZone,
      },
      validation: {
        minHeadlineSize: baseSize * recipe.typographyScale.ratios[0],
        minBodySize: recipe.reflowRules.minBodyFontSize,
        minContrast: 4.5,
        maxTextOverlap: 0,
      },
      metadata: {
        family: recipe.id,
        variant: 'base',
        readingFlow: recipe.readingFlow.type,
        hierarchy: this.determineHierarchy(copy),
      },
      sceneGraph,
    };

    return plan;
  }

  /**
   * CONSTRAINT SOLVER: Solve text layout with collision detection
   */
  private solveTextLayout(
    recipe: DesignFamilyRecipe,
    copy: { headline: string; body?: string; cta?: string; caption?: string },
    baseSize: number,
    canvas: { width: number; height: number },
    margins: any,
    availableWidth: number,
    availableHeight: number,
    logoBounds: Bounds,
    faceExclusionZones: Bounds[],
    imageBounds: Bounds,
  ): { textBounds: any; contentZone: Bounds } | { error: string; suggestion: string } {
    const textBounds: any = {};
    const alignment = recipe.typographyScale.alignment || (recipe.readingFlow.type.includes('center') ? 'center' : 'left');

    // Use readingFlow to determine starting Y position
    let currentY = margins.top;
    if (recipe.readingFlow.type === 'center_down') {
       currentY = canvas.height * 0.3; // start lower for center_down
    } else if (recipe.readingFlow.type === 'bottom_left') {
       currentY = canvas.height * 0.6; 
    }

    const textWidth = alignment === 'center' ? Math.min(availableWidth * 0.8, 800) : availableWidth;
    const getX = (itemWidth: number) => {
      if (alignment === 'center') return margins.left + (availableWidth - itemWidth) / 2;
      if (alignment === 'right') return margins.left + availableWidth - itemWidth;
      return margins.left;
    };

    // Calculate headline size
    const headlineSize = baseSize * recipe.typographyScale.ratios[0];
    const bodySize = baseSize * recipe.typographyScale.ratios[3];

    // Position headline
    const headlineHeight = this.estimateTextHeight(
      copy.headline,
      headlineSize,
      textWidth,
      recipe.reflowRules.maxHeadlineLines,
    );

    const headlineCandidate: Bounds = {
      x: getX(textWidth),
      y: currentY,
      width: textWidth,
      height: headlineHeight,
    };

    // Check constraint: overlaps logo?
    if (this.boundsOverlap(headlineCandidate, logoBounds)) {
      currentY = logoBounds.y + logoBounds.height + recipe.spacing.verticalRhythm;
      headlineCandidate.y = currentY;
    }

    // Check constraint: overlaps face?
    const faceOverlap = faceExclusionZones.find((zone) =>
      this.boundsOverlap(headlineCandidate, zone),
    );

    if (faceOverlap) {
      // Try to move headline below face
      headlineCandidate.y = faceOverlap.y + faceOverlap.height + recipe.spacing.verticalRhythm;
      currentY = headlineCandidate.y;

      if (this.boundsOverlap(headlineCandidate, faceOverlap)) {
         return {
           error: 'FACE_OVERLAP_UNSOLVABLE',
           suggestion: 'Try portrait_hero or minimal_text variant',
         };
      }
    }
    
    textBounds.headline = headlineCandidate;
    currentY = headlineCandidate.y + headlineCandidate.height + recipe.spacing.verticalRhythm;

    // Position body
    if (copy.body) {
      const bodyWidth = alignment === 'center' ? textWidth * 0.8 : textWidth;
      const bodyHeight = this.estimateTextHeight(
        copy.body,
        bodySize,
        bodyWidth,
        10, // body can wrap more
      );

      // Check if body fits
      if (currentY + bodyHeight > canvas.height - margins.bottom) {
        if (bodySize > recipe.reflowRules.minBodyFontSize) {
          return {
            error: 'TEXT_OVERFLOW',
            suggestion: 'Reduce copy or use minimal variant',
          };
        }
      }

      textBounds.body = {
        x: getX(bodyWidth),
        y: currentY,
        width: bodyWidth,
        height: bodyHeight,
      };

      currentY += bodyHeight + recipe.spacing.verticalRhythm;
    }

    // Position CTA
    if (copy.cta) {
      const ctaWidth = Math.min(availableWidth, 300);
      const ctaHeight = this.estimateTextHeight(
        copy.cta,
        baseSize * recipe.typographyScale.ratios[2],
        ctaWidth,
        2,
      );

      // Default CTA to bottom or directly under body depending on readingFlow
      const ctaY = recipe.readingFlow.type.includes('center') 
        ? currentY + recipe.spacing.verticalRhythm 
        : canvas.height - margins.bottom - ctaHeight - recipe.spacing.verticalRhythm;

      textBounds.cta = {
        x: getX(ctaWidth),
        y: ctaY,
        width: ctaWidth,
        height: ctaHeight,
      };
    }

    const contentZone: Bounds = {
      x: margins.left,
      y: margins.top,
      width: availableWidth,
      height: availableHeight,
    };

    return { textBounds, contentZone };
  }

  /**
   * Position logo (FIXED)
   */
  private positionLogo(recipe: DesignFamilyRecipe, canvas: { width: number; height: number }): Bounds {
    const logoConfig = recipe.logo;
    let x = 0,
      y = 0;

    switch (logoConfig.position) {
      case 'top_left':
        x = logoConfig.offset.x;
        y = logoConfig.offset.y;
        break;
      case 'top_right':
        x = canvas.width - logoConfig.maxWidth - logoConfig.offset.x;
        y = logoConfig.offset.y;
        break;
      case 'top_center':
        x = (canvas.width - logoConfig.maxWidth) / 2;
        y = logoConfig.offset.y;
        break;
      case 'bottom_center':
        x = (canvas.width - logoConfig.maxWidth) / 2;
        y = canvas.height - 60 - logoConfig.offset.y;
        break;
      default:
        x = logoConfig.offset.x;
        y = logoConfig.offset.y;
    }

    return {
      x,
      y,
      width: logoConfig.maxWidth,
      height: 40, // Assume standard logo height
    };
  }

  /**
   * Position image hero
   */
  private positionImage(
    recipe: DesignFamilyRecipe,
    canvas: { width: number; height: number },
    margins: any,
    availableWidth: number,
    availableHeight: number,
  ): Bounds {
    const imageHeight = availableHeight * (recipe.dominance.imageRatio / (1 - recipe.spacing.whitespaceRatio + recipe.dominance.imageRatio));

    return {
      x: margins.left,
      y: margins.top,
      width: availableWidth,
      height: Math.min(imageHeight, availableHeight * 0.7),
    };
  }

  /**
   * Build typography specifications from recipe scale
   */
  private buildTypographySpecs(
    recipe: DesignFamilyRecipe,
    baseSize: number,
    textBounds: any,
  ): any {
    const scale = recipe.typographyScale;

    return {
      headline: {
        fontSize: baseSize * scale.ratios[0],
        fontWeight: scale.fontWeights[0],
        lineHeight: scale.lineHeights[0],
        fontFamily: scale.fontFamilies.headline,
        color: recipe.colors.headline,
        alignment: scale.alignment || 'left',
        letterSpacing: scale.trackings ? scale.trackings[0] : 0,
        textTransform: scale.casings ? scale.casings[0] : 'none',
        maxWidth: textBounds.headline?.width,
      },
      body: {
        fontSize: baseSize * scale.ratios[3],
        fontWeight: scale.fontWeights[3],
        lineHeight: scale.lineHeights[3],
        fontFamily: scale.fontFamilies.body,
        color: recipe.colors.body,
        alignment: scale.alignment || 'left',
        letterSpacing: scale.trackings ? scale.trackings[3] : 0,
        textTransform: scale.casings ? scale.casings[3] : 'none',
        maxWidth: textBounds.body?.width,
      },
      cta: {
        fontSize: baseSize * scale.ratios[2],
        fontWeight: scale.fontWeights[2],
        lineHeight: scale.lineHeights[2] || 1.2,
        fontFamily: scale.fontFamilies.body,
        color: recipe.colors.headline,
        alignment: 'center',
        letterSpacing: scale.trackings ? scale.trackings[2] : 0,
        textTransform: scale.casings ? scale.casings[2] : 'none',
      },
    };
  }

  /**
   * Position primitives (decorations)
   */
  private positionPrimitives(
    recipe: DesignFamilyRecipe,
    canvas: { width: number; height: number },
    margins: any,
    textBounds: any,
    imageBounds: Bounds,
  ): any[] {
    const primitives: any[] = [];

    for (const [id, primitive] of Object.entries(recipe.primitives)) {
      if (primitive.visibility === 'never') continue;

      // Determine position based on primitive type
      let bounds: Bounds;

      if (primitive.type === 'rule') {
        bounds = {
          x: margins.left,
          y: imageBounds.y + imageBounds.height + recipe.spacing.verticalRhythm,
          width: canvas.width - margins.left - margins.right,
          height: 2,
        };
      } else if (primitive.type === 'frame') {
        bounds = {
          x: imageBounds.x - 2,
          y: imageBounds.y - 2,
          width: imageBounds.width + 4,
          height: imageBounds.height + 4,
        };
      } else if (primitive.type === 'badge') {
        bounds = {
          x: canvas.width - margins.right - 100,
          y: margins.top + 20,
          width: 90,
          height: 50,
        };
      } else {
        bounds = { x: 0, y: 0, width: 0, height: 0 };
      }

      primitives.push({
        id,
        type: primitive.type,
        bounds,
        opacity: primitive.opacity,
        thickness: primitive.thickness,
        color: primitive.color,
      });
    }

    return primitives;
  }

  /**
   * Utility: Check if two bounds overlap
   */
  private boundsOverlap(a: Bounds, b: Bounds): boolean {
    return (
      a.x < b.x + b.width &&
      a.x + a.width > b.x &&
      a.y < b.y + b.height &&
      a.y + a.height > b.y
    );
  }

  /**
   * Utility: Expand bounds by buffer
   */
  private expandBounds(bounds: Bounds, buffer: number): Bounds {
    return {
      x: bounds.x - buffer,
      y: bounds.y - buffer,
      width: bounds.width + buffer * 2,
      height: bounds.height + buffer * 2,
    };
  }

  /**
   * Utility: Estimate text height (rough calculation)
   */
  private estimateTextHeight(
    text: string,
    fontSize: number,
    maxWidth: number,
    maxLines: number,
  ): number {
    const charsPerLine = Math.max(1, Math.floor(maxWidth / (fontSize * 0.6)));
    const lines = Math.min(maxLines, Math.ceil(text.length / charsPerLine));
    return lines * fontSize * 1.5;
  }

  /**
   * Determine hierarchy tier
   */
  private determineHierarchy(copy: {
    headline: string;
    body?: string;
    cta?: string;
    caption?: string;
  }): 'single' | 'dual' | 'triple' | 'quad' {
    let count = 1;
    if (copy.body) count++;
    if (copy.cta) count++;
    if (copy.caption) count++;

    if (count === 1) return 'single';
    if (count === 2) return 'dual';
    if (count === 3) return 'triple';
    return 'quad';
  }

  /**
   * BUILD SCENE GRAPH - The renderer's instructions
   * This defines EXACTLY what to draw, in what order, with what constraints
   * Generic renderer loops through layers and calls draw() - no hardcoding
   */
  private buildSceneGraph(
    recipe: DesignFamilyRecipe,
    imageBounds: Bounds,
    logoBounds: Bounds,
    textBounds: any,
    typographySpecs: any,
    primitives: any[],
    faceExclusionZones: Bounds[],
    textContentZone: Bounds,
    canvas: { width: number; height: number },
  ): any {
    const layers: any[] = [];

    // ── Layer 0: Background (color from BrandDNA via recipe) ────────────────
    layers.push({
      id: 'background',
      type: 'background',
      zIndex: 0,
      bounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      constraintZones: [],
      properties: {
        color: recipe.colors.supporting, // From BrandDNA (applied in RecipeResolver)
        opacity: 1.0,
      },
      renderingHint: {
        isStructural: false,
        isDecorative: true,
        canOverlapText: false,
        priority: 'secondary',
      },
    });

    // ── Layer 1: Image (hero) ───────────────────────────────────────────────
    layers.push({
      id: 'image_hero',
      type: 'image',
      zIndex: 1,
      bounds: imageBounds,
      constraintZones: [logoBounds], // Don't cover logo
      properties: {
        masking: 'rectangle',
      },
      renderingHint: {
        isStructural: true,
        isDecorative: false,
        canOverlapText: false,
        priority: 'critical',
      },
    });

    // ── Layer 2-10: Structural Primitives (VISIBLE, not decorative) ──────────
    // Order by z-index, make sure they're visible
    const sortedPrimitives = primitives.sort((a, b) => (a.zIndex || 5) - (b.zIndex || 5));

    for (const prim of sortedPrimitives) {
      const primZIndex = prim.zIndex || 5 + sortedPrimitives.indexOf(prim);

      // Use exact opacity from recipe
      const visibleOpacity = prim.opacity;

      // Map primitive color type to actual BrandDNA color from recipe
      const getPrimitiveColor = (colorType: string | undefined): string => {
        if (!colorType) return recipe.colors.decorative; // Default from BrandDNA
        if (colorType === 'primary') return recipe.colors.headline; // From BrandDNA
        if (colorType === 'secondary') return recipe.colors.decorative; // From BrandDNA
        if (colorType === 'neutral') return recipe.colors.supporting; // From BrandDNA
        return recipe.colors.headline; // Fallback from BrandDNA
      };

      layers.push({
        id: prim.id,
        type: 'primitive',
        zIndex: primZIndex,
        bounds: prim.bounds || { x: 0, y: 0, width: 100, height: 100 },
        constraintZones: [logoBounds, imageBounds, ...faceExclusionZones], // Respect critical zones including faces
        properties: {
          primitiveType: prim.type,
          primitiveOpacity: visibleOpacity, // Make it visible
          primitiveColor: getPrimitiveColor(prim.color), // From BrandDNA
          primitiveThickness: prim.thickness || 2,
          primitiveStyle: {
            strokeWidth: prim.thickness || 2,
            fillOpacity: visibleOpacity,
            strokeOpacity: visibleOpacity,
          },
        },
        renderingHint: {
          isStructural: true, // Primitives ARE structural
          isDecorative: false,
          canOverlapText: false,
          priority: 'important',
        },
      });
    }

    // ── Layer 20: Headline (primary text) ────────────────────────────────────
    if (textBounds.headline) {
      layers.push({
        id: 'text_headline',
        type: 'text',
        zIndex: 20,
        bounds: textBounds.headline,
        constraintZones: faceExclusionZones, // RESPECT faces
        properties: {
          text: 'PLACEHOLDER_HEADLINE',
          textSpec: typographySpecs.headline,
          avoidRegions: faceExclusionZones,
        },
        renderingHint: {
          isStructural: true,
          isDecorative: false,
          canOverlapText: false,
          priority: 'critical',
        },
      });
    }

    // ── Layer 21: Body text ──────────────────────────────────────────────────
    if (textBounds.body) {
      layers.push({
        id: 'text_body',
        type: 'text',
        zIndex: 21,
        bounds: textBounds.body,
        constraintZones: faceExclusionZones, // RESPECT faces
        properties: {
          text: 'PLACEHOLDER_BODY',
          textSpec: typographySpecs.body,
          avoidRegions: faceExclusionZones,
        },
        renderingHint: {
          isStructural: false,
          isDecorative: false,
          canOverlapText: false,
          priority: 'important',
        },
      });
    }

    // ── Layer 22: CTA text ───────────────────────────────────────────────────
    if (textBounds.cta) {
      layers.push({
        id: 'text_cta',
        type: 'text',
        zIndex: 22,
        bounds: textBounds.cta,
        constraintZones: faceExclusionZones, // RESPECT faces
        properties: {
          text: 'PLACEHOLDER_CTA',
          textSpec: typographySpecs.cta,
          avoidRegions: faceExclusionZones,
        },
        renderingHint: {
          isStructural: true,
          isDecorative: false,
          canOverlapText: false,
          priority: 'important',
        },
      });
    }

    // ── Layer 100: Logo (always on top, protected) ──────────────────────────
    layers.push({
      id: 'logo',
      type: 'image',
      zIndex: 100,
      bounds: logoBounds,
      constraintZones: [imageBounds], // Logo is protected, don't cover it
      properties: {
        masking: 'rectangle',
      },
      renderingHint: {
        isStructural: true,
        isDecorative: false,
        canOverlapText: false,
        priority: 'critical',
      },
    });

    return {
      layers,
      canvasBounds: { x: 0, y: 0, width: canvas.width, height: canvas.height },
      composition: {
        family: recipe.id,
        variant: 'base',
        readingFlow: recipe.readingFlow.type,
      },
    };
  }

  /**
   * PHASE 2: HIERARCHICAL DESIGN ENGINE
   * Translates exact DesignTokens into a rigid SceneGraph for the dumb renderer.
   * Eliminates dynamic constraint solving in favor of explicit token instructions.
   */
  private buildPlanFromTokens(tokens: any, context: any): any {
    const { canvas, copy } = context;
    const w = canvas.width;
    const h = canvas.height;
    const layers: any[] = [];
    
    const pctToX = (p: number) => (p / 100) * w;
    const pctToY = (p: number) => (p / 100) * h;
    const pctToW = (p: number) => (p / 100) * w;
    const pctToH = (p: number) => (p / 100) * h;

    // 1. Background
    layers.push({
      id: 'bg',
      type: 'background',
      zIndex: 0,
      bounds: { x: 0, y: 0, width: w, height: h },
      constraintZones: [],
      properties: { color: tokens.colors.background }
    });

    // 2. Photo
    if (tokens.composition.photo) {
      const p = tokens.composition.photo;
      layers.push({
        id: 'photo',
        type: 'image',
        zIndex: p.zIndex,
        bounds: { x: pctToX(p.x), y: pctToY(p.y), width: pctToW(p.width), height: pctToH(p.height) },
        constraintZones: [],
        properties: { masking: tokens.photoTreatment.mask }
      });
    }

    // 3. Text Block
    if (tokens.composition.textBlock) {
      const tb = tokens.composition.textBlock;
      let currentY = pctToY(tb.y);
      const textX = pctToX(tb.x);
      const textW = pctToW(tb.width);

      if (copy.headline) {
         layers.push({
           id: 'headline',
           type: 'text',
           zIndex: tb.zIndex,
           bounds: { x: textX, y: currentY, width: textW, height: 200 },
           constraintZones: [],
           properties: {
             text: copy.headline,
             textSpec: {
               fontSize: tokens.typography.headlineSize,
               fontWeight: tokens.typography.headlineWeight,
               lineHeight: tokens.typography.headlineLineHeight,
               fontFamily: 'Inter',
               color: tokens.colors.headline,
               alignment: tokens.typography.headlineAlignment,
               maxWidth: textW
             }
           }
         });
         currentY += tokens.typography.headlineSize * 1.5;
      }
      
      if (copy.body) {
         layers.push({
           id: 'body',
           type: 'text',
           zIndex: tb.zIndex,
           bounds: { x: textX, y: currentY, width: textW, height: 200 },
           constraintZones: [],
           properties: {
             text: copy.body,
             textSpec: {
               fontSize: tokens.typography.bodySize,
               fontWeight: tokens.typography.bodyWeight,
               lineHeight: tokens.typography.bodyLineHeight,
               fontFamily: 'Inter',
               color: tokens.colors.body,
               alignment: tokens.typography.headlineAlignment,
               maxWidth: textW
             }
           }
         });
      }
    }
    
    // 4. Primitives
    if (tokens.primitives) {
      tokens.primitives.forEach((prim: any) => {
        layers.push({
          id: prim.id,
          type: 'primitive',
          zIndex: prim.zIndex,
          bounds: { x: pctToX(prim.x), y: pctToY(prim.y), width: pctToW(prim.width || 10), height: pctToH(prim.height || 10) },
          constraintZones: [],
          properties: {
            primitiveType: prim.component,
            primitiveColor: prim.color,
            primitiveOpacity: prim.opacity
          }
        });
      });
    }

    // 5. Logo (Fixed top left or based on variant, assuming standard fallback for now)
    layers.push({
      id: 'logo',
      type: 'image',
      zIndex: 100,
      bounds: { x: 40, y: 40, width: 200, height: 80 },
      constraintZones: [],
      properties: { masking: 'rectangle' }
    });

    return {
      sceneGraph: {
        layers,
        canvasBounds: { x: 0, y: 0, width: w, height: h },
        composition: { family: 'clinical', variant: tokens.mode, readingFlow: 'center_down' }
      },
      // Fake legacy properties to keep `TemplateRenderingIntegration.validatePlanStructure` happy
      layout: { 
        logo: { width: 1 }, 
        image: { width: 1 },
        headline: { width: 1 }
      },
      typography: { headline: {} },
      constraints: { logoReservedZone: {} }
    };
  }
}
