import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ContentPillar = 'client_results' | 'behind_the_scenes' | 'education_tips' | 'promotion';
export type LayoutType = 'passepartout_text' | 'passepartout_clean' | 'full_bleed_clean' | 'split_before_after' | 'asymmetric_monogram' | 'translucent_split' | 'poster_cover' | 'postcard_ticket' | 'editorial_arch' | 'text_only_editorial' | 'filmstrip_grid' | 'handwritten_note' | 'gallery_frame' | 'duotone_editorial' | 'side_panel_split' | 'bold_editorial_poster' | 'giant_type_overlay' | 'chat_bubble_quote' | 'testimonial_card';

@Injectable()
export class GridOrchestratorService {
  constructor(private prisma: PrismaService) {}

  /**
   * Evaluates the tenant's last 6 posts to select the next balanced pillar and layout.
   */
  async determineNextLayoutAndPillar(tenantId: string): Promise<{ pillar: ContentPillar; layout: LayoutType }> {
    const lastPosts = await this.prisma.contentItem.findMany({
      where: {
        tenantId,
        status: 'published',
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
    const layouts: LayoutType[] = ['passepartout_text', 'passepartout_clean', 'full_bleed_clean', 'split_before_after', 'asymmetric_monogram', 'translucent_split', 'poster_cover', 'postcard_ticket', 'editorial_arch', 'text_only_editorial', 'filmstrip_grid', 'handwritten_note', 'gallery_frame', 'duotone_editorial', 'side_panel_split', 'bold_editorial_poster', 'giant_type_overlay', 'chat_bubble_quote', 'testimonial_card'];

    // Scoring system: penalize recent items to force rotation
    const pillarScores = { client_results: 0, behind_the_scenes: 0, education_tips: 0, promotion: 0 };
    const layoutScores = {
      passepartout_text: 0,
      passepartout_clean: 0,
      full_bleed_clean: 0,
      split_before_after: 0,
      asymmetric_monogram: 0,
      translucent_split: 0,
      poster_cover: 0,
      postcard_ticket: 0,
      editorial_arch: 0,
      text_only_editorial: 0,
      filmstrip_grid: 0,
      handwritten_note: 0,
      gallery_frame: 0,
      duotone_editorial: 0,
      side_panel_split: 0,
      bold_editorial_poster: 0,
      giant_type_overlay: 0,
      chat_bubble_quote: 0,
      testimonial_card: 0
    };

    lastPosts.forEach((post, index) => {
      // Index 0 is the most recent (highest penalty)
      const penalty = 6 - index;

      if (post.contentPillar && post.contentPillar in pillarScores) {
        pillarScores[post.contentPillar as ContentPillar] += penalty;
      }
      if (post.layoutType && post.layoutType in layoutScores) {
        layoutScores[post.layoutType as LayoutType] += penalty;
      }
    });

    // Pick the one with the lowest score
    let selectedPillar = pillars[0];
    let minPillarScore = Infinity;
    for (const p of pillars) {
      if (pillarScores[p] < minPillarScore) {
        minPillarScore = pillarScores[p];
        selectedPillar = p;
      }
    }

    let selectedLayout = layouts[0];
    let minLayoutScore = Infinity;
    for (const l of layouts) {
      if (layoutScores[l] < minLayoutScore) {
        minLayoutScore = layoutScores[l];
        selectedLayout = l;
      }
    }

    return {
      pillar: selectedPillar,
      layout: selectedLayout,
    };
  }
}
