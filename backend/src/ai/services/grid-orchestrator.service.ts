import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ContentPillar = 'client_results' | 'behind_the_scenes' | 'education_tips' | 'promotion';
export type LayoutType = 'passepartout_text' | 'passepartout_clean' | 'full_bleed_clean' | 'split_before_after' | 'asymmetric_monogram' | 'translucent_split' | 'poster_cover' | 'postcard_ticket' | 'editorial_arch' | 'text_only_editorial' | 'filmstrip_grid' | 'handwritten_note' | 'gallery_frame' | 'duotone_editorial' | 'side_panel_split' | 'bold_editorial_poster' | 'giant_type_overlay' | 'chat_bubble_quote' | 'testimonial_card' | 'transparent_scrim' | 'premium_diptyque' | 'art_director_split' | 'date_highlight' | 'signature_feature';

@Injectable()
export class GridOrchestratorService {
  constructor(private prisma: PrismaService) { }

  /**
   * Evaluates the tenant's last 6 posts to select the next balanced pillar and layout.
   */
  async determineNextLayoutAndPillar(tenantId: string): Promise<{ pillar: ContentPillar; layout: LayoutType }> {
    // Look at all recent generations (not just published posts) — most content sits in
    // `draft` until manually approved, so restricting to `published` left this with no
    // history to react to and it always fell back to the first layout/pillar in the list.
    const lastPosts = await this.prisma.contentItem.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        createdAt: 'desc',
      },
      take: 6,
      select: {
        contentPillar: true,
        layoutType: true,
      },
    });

    const pillars: ContentPillar[] = ['client_results', 'behind_the_scenes', 'education_tips', 'promotion'];
    let layouts: LayoutType[] = [];
    let newTemplates: any = {};
    try {
      newTemplates = require('../config/compiled-layouts.v2.json');
      layouts = Object.keys(newTemplates) as LayoutType[];
    } catch (e) {
      layouts = ['passepartout_text', 'passepartout_clean', 'full_bleed_clean', 'split_before_after', 'asymmetric_monogram', 'translucent_split', 'poster_cover', 'postcard_ticket', 'editorial_arch', 'text_only_editorial', 'filmstrip_grid', 'handwritten_note', 'gallery_frame', 'duotone_editorial', 'side_panel_split', 'bold_editorial_poster', 'giant_type_overlay', 'chat_bubble_quote', 'testimonial_card', 'transparent_scrim', 'premium_diptyque', 'art_director_split', 'date_highlight', 'signature_feature'];
    }

    // 1. Determine Pillar using penalty system
    const pillarScores = { client_results: 0, behind_the_scenes: 0, education_tips: 0, promotion: 0 };
    lastPosts.forEach((post, index) => {
      const penalty = 6 - index;
      if (post.contentPillar && post.contentPillar in pillarScores) {
        pillarScores[post.contentPillar as ContentPillar] += penalty;
      }
    });

    const minPillarScore = Math.min(...pillars.map((p) => pillarScores[p]));
    const tiedPillars = pillars.filter((p) => pillarScores[p] === minPillarScore);
    const selectedPillar = tiedPillars[Math.floor(Math.random() * tiedPillars.length)]!;

    // 2. Intelligent Grid Analyzer for Layout Constraints
    let heavyTextCount = 0;
    let minimalCount = 0;
    let splitCount = 0;

    let legacyTemplates: any = {};
    try {
      legacyTemplates = require('../config/layout-templates.config.json');
      newTemplates = require('../config/compiled-layouts.v2.json');
    } catch (e) {}

    lastPosts.slice(0, 3).forEach((post) => {
      if (!post.layoutType) return;
      const t = legacyTemplates[post.layoutType] || newTemplates[post.layoutType] || {};
      const textRegion = t.textTemplate || t.visual_structure?.text_regions || '';
      const baseRegion = t.base || t.concept || t.category || '';
      
      const str = (textRegion + ' ' + baseRegion).toLowerCase();
      
      if (str.includes('passepartout') || str.includes('large') || str.includes('overlay') || str.includes('poster')) {
        heavyTextCount++;
      }
      if (str.includes('split') || str.includes('diptyque')) {
        splitCount++;
      }
      if (str.includes('clean') || str.includes('full_bleed') || str.includes('transparent')) {
        minimalCount++;
      }
    });

    type ConstraintMode = 'avoid_heavy' | 'prefer_structured' | 'avoid_split' | 'none';
    let gridConstraints = "No strict constraints. Prioritize the most beautiful and contextually appropriate layout.";
    let constraintMode: ConstraintMode = 'none';
    if (heavyTextCount >= 2) {
      gridConstraints = "AVOID heavy text overlays and blocky layouts. MUST select a minimal, image-heavy, or full-bleed layout to balance the grid.";
      constraintMode = 'avoid_heavy';
    } else if (minimalCount >= 2) {
      gridConstraints = "PREFER layouts with strong typography or structured text frames (like split screen or passepartout).";
      constraintMode = 'prefer_structured';
    } else if (splitCount >= 2) {
      gridConstraints = "AVOID split-screen layouts. PREFER full bleed or asymmetric layouts.";
      constraintMode = 'avoid_split';
    }

    // Classify each candidate layout the same way recent-post history is classified above,
    // so the constraint we just derived from that history actually narrows the candidate pool
    // instead of being advisory text nobody reads.
    const classify = (layoutId: string): { heavy: boolean; split: boolean; minimal: boolean } => {
      const t = legacyTemplates[layoutId] || newTemplates[layoutId] || {};
      const textRegion = t.textTemplate || t.visual_structure?.text_regions || '';
      const baseRegion = t.base || t.concept || t.category || '';
      const str = (textRegion + ' ' + baseRegion + ' ' + layoutId).toLowerCase();
      return {
        heavy: /passepartout|large|overlay|poster/.test(str),
        split: /split|diptyque/.test(str),
        minimal: /clean|full_bleed|transparent/.test(str),
      };
    };

    let candidatePool = layouts;
    if (constraintMode === 'avoid_heavy') {
      candidatePool = layouts.filter((l) => !classify(l).heavy);
    } else if (constraintMode === 'avoid_split') {
      candidatePool = layouts.filter((l) => !classify(l).split);
    } else if (constraintMode === 'prefer_structured') {
      const structured = layouts.filter((l) => classify(l).split || classify(l).heavy);
      if (structured.length > 0) candidatePool = structured;
    }
    // If a constraint filters out every candidate (small/legacy layout pools), fall back to
    // the full list rather than throwing — a slightly repetitive post beats a crash.
    if (candidatePool.length === 0) candidatePool = layouts;

    const randomLayout = candidatePool.length > 0 ? candidatePool[Math.floor(Math.random() * candidatePool.length)]! : 'single_hero';

    return {
      pillar: selectedPillar,
      layout: randomLayout as any,
      gridConstraints
    } as any;
  }
}
