import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export type ContentPillar = 'client_results' | 'behind_the_scenes' | 'education_tips' | 'promotion';
export type LayoutType = 'passepartout_text' | 'passepartout_clean' | 'full_bleed_clean' | 'split_before_after' | 'asymmetric_monogram' | 'translucent_split' | 'poster_cover' | 'postcard_ticket' | 'editorial_arch' | 'text_only_editorial' | 'filmstrip_grid' | 'handwritten_note' | 'gallery_frame' | 'duotone_editorial' | 'side_panel_split' | 'bold_editorial_poster' | 'giant_type_overlay' | 'chat_bubble_quote' | 'testimonial_card';

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
      transparent_scrim: 0,
      premium_diptyque: 0,
      art_director_split: 0,
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

    // Pick randomly among whichever pillars/layouts are tied for the lowest (least-recently-used)
    // score — a strict "first tie wins" pick would always resolve to the same array entry
    // whenever there's no history yet (all scores 0), which is what caused it to always
    // return the same layout instead of exploring the full set.
    const minPillarScore = Math.min(...pillars.map((p) => pillarScores[p]));
    const tiedPillars = pillars.filter((p) => pillarScores[p] === minPillarScore);
    const selectedPillar = tiedPillars[Math.floor(Math.random() * tiedPillars.length)]!;

    const minLayoutScore = Math.min(...layouts.map((l) => layoutScores[l]));
    const tiedLayouts = layouts.filter((l) => layoutScores[l] === minLayoutScore);
    const selectedLayout = tiedLayouts[Math.floor(Math.random() * tiedLayouts.length)]!;

    return {
      pillar: selectedPillar,
      layout: selectedLayout,
    };
  }
}
