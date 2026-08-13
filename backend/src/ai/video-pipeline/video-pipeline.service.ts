import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { isMedicalAestheticsBrand } from '../config/medical-compliance';
import { defaultVoiceId } from './assets/voice-id';
import { parseVideoPlan } from './contract';
import { videoJobDenormalizedFields } from './core/plan-status';
import { buildReelsPlan } from './core/reels-plan-builder';
import { buildSlideshowPlan } from './core/slideshow-plan-builder';
import type { CreateReelsDto } from './dto/create-reels.dto';
import type { CreateSlideshowDto } from './dto/create-slideshow.dto';
import { VideoQueueService } from './video-queue.service';

@Injectable()
export class VideoPipelineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queues: VideoQueueService,
  ) {}

  async createAndRenderSlideshow(
    tenantId: string,
    technicianId: string,
    dto: CreateSlideshowDto,
  ) {
    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    });
    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before video generation');
    }

    const palette = [brandDna.primaryBrandColor, brandDna.secondaryBrandColor].filter(
      (c): c is string => !!c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c),
    );
    const plan = parseVideoPlan(buildSlideshowPlan({
      technicianId,
      brandDnaRef: brandDna.id,
      objective: dto.objective ?? 'EDUCATE_TRUST',
      images: dto.imageUrls.map((url, index) => ({
        url,
        headline: dto.headlines?.[index] ?? null,
      })),
      branding: {
        logoAssetId: null,
        palette: palette.length > 0 ? palette : ['#C4A484'],
        font: brandDna.brandFont || 'Montserrat',
      },
      medicalAesthetics: isMedicalAestheticsBrand(brandDna),
    }));

    const job = await this.prisma.videoJob.create({
      data: {
        tenantId,
        technicianId,
        brandDnaId: brandDna.id,
        ...videoJobDenormalizedFields(plan),
        plan: plan as unknown as Prisma.InputJsonValue,
      },
    });

    await this.queues.enqueueRender(job.id, tenantId);
    return { videoJobId: job.id, status: job.status };
  }

  async createAndDirectSlideshow(
    tenantId: string,
    technicianId: string,
    dto: CreateSlideshowDto,
  ) {
    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    });
    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before video generation');
    }

    const palette = [brandDna.primaryBrandColor, brandDna.secondaryBrandColor].filter(
      (c): c is string => !!c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c),
    );
    const medicalAesthetics = isMedicalAestheticsBrand(brandDna);
    const plan = parseVideoPlan(buildSlideshowPlan({
      technicianId,
      brandDnaRef: brandDna.id,
      objective: dto.objective ?? 'EDUCATE_TRUST',
      images: dto.imageUrls.map((url, index) => ({
        url,
        headline: dto.headlines?.[index] ?? null,
      })),
      branding: {
        logoAssetId: null,
        palette: palette.length > 0 ? palette : ['#C4A484'],
        font: brandDna.brandFont || 'Montserrat',
      },
      medicalAesthetics,
    }));

    const job = await this.prisma.videoJob.create({
      data: {
        tenantId,
        technicianId,
        brandDnaId: brandDna.id,
        ...videoJobDenormalizedFields(plan),
        plan: plan as unknown as Prisma.InputJsonValue,
        loopState: {
          step: 'created',
          tokensUsed: 0,
          costUsd: 0,
          toolCalls: 0,
          repaired: false,
          requestedSceneCount: dto.sceneCount,
          brandVoice: [
            brandDna.businessName,
            brandDna.oneLiner,
            brandDna.primaryTone,
            brandDna.brandEssenceSentence,
          ]
            .filter(Boolean)
            .join('\n'),
        } as Prisma.InputJsonValue,
      },
    });

    await this.queues.enqueueDirector(job.id, tenantId);
    return { videoJobId: job.id, status: job.status };
  }

  async createAndDirectReels(
    tenantId: string,
    technicianId: string,
    dto: CreateReelsDto,
  ) {
    const brandDna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
    });
    if (!brandDna) {
      throw new BadRequestException('Brand DNA must be configured before video generation');
    }

    const palette = [brandDna.primaryBrandColor, brandDna.secondaryBrandColor].filter(
      (c): c is string => !!c && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(c),
    );
    const assets = [
      ...(dto.imageUrls ?? []).map((url) => ({ url, kind: 'IMAGE' as const })),
      ...(dto.clipUrls ?? []).map((url) => ({ url, kind: 'VIDEO' as const })),
    ];
    const sceneCount = dto.sceneCount ?? Math.max(assets.length, 3);
    const plan = parseVideoPlan(buildReelsPlan({
      technicianId,
      brandDnaRef: brandDna.id,
      objective: dto.objective ?? 'EDUCATE_TRUST',
      assets,
      sceneCount,
      branding: {
        logoAssetId: null,
        palette: palette.length > 0 ? palette : ['#C4A484'],
        font: brandDna.brandFont || 'Montserrat',
      },
      medicalAesthetics: isMedicalAestheticsBrand(brandDna),
    }));

    const job = await this.prisma.videoJob.create({
      data: {
        tenantId,
        technicianId,
        brandDnaId: brandDna.id,
        ...videoJobDenormalizedFields(plan),
        plan: plan as unknown as Prisma.InputJsonValue,
        loopState: {
          step: 'created',
          tokensUsed: 0,
          costUsd: 0,
          toolCalls: 0,
          repaired: false,
          requestedSceneCount: sceneCount,
          voiceId: defaultVoiceId(brandDna.primaryTone),
          brandVoice: [
            brandDna.businessName,
            brandDna.oneLiner,
            brandDna.primaryTone,
            brandDna.brandEssenceSentence,
          ]
            .filter(Boolean)
            .join('\n'),
        } as Prisma.InputJsonValue,
      },
    });

    await this.queues.enqueueDirector(job.id, tenantId);
    return { videoJobId: job.id, status: job.status };
  }

  async getJob(tenantId: string, videoJobId: string) {
    const job = await this.prisma.videoJob.findFirst({
      where: { id: videoJobId, tenantId },
    });
    if (!job) throw new NotFoundException('Video job not found');
    const loopState = job.loopState as { step?: string } | null;
    return {
      videoJobId: job.id,
      status: job.status,
      videoType: job.videoType,
      outputUrl: job.outputUrl,
      renderId: job.shotstackRenderId,
      tokensUsed: job.tokensUsed,
      estimatedCostUsd: job.estimatedCostUsd,
      directorStep: loopState?.step ?? null,
      plan: job.plan,
    };
  }
}
