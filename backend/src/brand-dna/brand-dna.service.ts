import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDnaDto, ScanInstagramDto, ScanWebsiteDto } from './dto/brand-dna.dto';
import { PromptCache } from '../ai/orchestrator/prompt-cache';
import { getRedisClient } from '../config/redis.client';
import { firebaseStorage } from '../config/firebase.client';

@Injectable()
export class BrandDnaService {
  private readonly promptCache: PromptCache;

  constructor(private prisma: PrismaService) {
    this.promptCache = new PromptCache(getRedisClient());
  }

  async getCurrentDna(tenantId: string) {
    const dna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
      include: { pillars: true, goals: true }
    });
    return dna;
  }

  async createOrUpdateDna(tenantId: string, dto: CreateBrandDnaDto) {
    await this.promptCache.invalidateTenantCache(tenantId);
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.brandDNA.findUnique({
        where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
      });

      const nextVersion = current ? current.version + 1 : 1;

      if (current) {
        // Delete old non-current versions first to avoid unique constraint on (tenant_id, is_current)
        const old = await tx.brandDNA.findMany({
          where: { tenantId, isCurrent: false },
          select: { id: true },
        });
        if (old.length > 0) {
          const oldIds = old.map((r) => r.id);
          await tx.brandPillar.deleteMany({ where: { brandDNAId: { in: oldIds } } });
          await tx.brandGoal.deleteMany({ where: { brandDNAId: { in: oldIds } } });
          await tx.brandDNA.deleteMany({ where: { id: { in: oldIds } } });
        }
        await tx.brandDNA.update({
          where: { id: current.id },
          data: { isCurrent: false }
        });
      }

      return tx.brandDNA.create({
        data: {
          tenantId,
          version: nextVersion,
          businessName: dto.businessName,
          oneLiner: dto.oneLiner,
          uniqueSellingProposition: dto.uniqueSellingProposition,
          primaryPersona: dto.primaryPersona,
          secondaryPersona: dto.personaAge,
          locationCity: dto.personaLocation,
          primaryTone: dto.primaryTone,
          clientPainPoints: [],
          vocabularyBlacklist: [],
          vocabularyPreferred: dto.voiceDo || [],
          doNotSay: dto.voiceDont || [],
          aestheticDirection: dto.aestheticDirection as any,
          brandTier: dto.brandTier as any,
          primaryBrandColor: dto.primaryBrandColor,
          secondaryBrandColor: dto.secondaryBrandColor,
          backgroundBrandColor: dto.backgroundBrandColor,
          accentBrandColor: dto.accentBrandColor,
          depthBrandColor: dto.depthBrandColor,
          emojiPolicy: dto.emojiPolicy || 'minimal',
          captionLengthPreference: dto.captionLengthPreference || 'medium',
          logoUrl: dto.logoUrl,
          logoPosition: dto.logoPosition || 'bottom_right',
          moodboardUrls: dto.moodboardUrls || [],
          moodboardLabels: dto.moodboardLabels || [],
          visualRanking: dto.visualRanking || [],
          lightingPreference: dto.lightingPreference,
          texturePreference: dto.texturePreference,
          compositionStyle: dto.compositionStyle,
          environmentPreference: dto.environmentPreference,
          finishPreference: dto.finishPreference,
          audienceLifestyle: dto.audienceLifestyle,
          commercialObjective: dto.commercialObjective,
          clientFears: dto.clientFears,
          clientTrustTriggers: dto.clientTrustTriggers,
          clientVisualTaste: dto.clientVisualTaste,
          clientBuyingTriggers: dto.clientBuyingTriggers,
          clientEmotionalOutcome: dto.clientEmotionalOutcome,
          brandPerceptionGoal: dto.brandPerceptionGoal,
          brandProofStatement: dto.brandProofStatement,
          brandNeverLooksLike: dto.brandNeverLooksLike,
          pillars: {
            create: dto.pillars?.map((label, i) => ({
              label,
              sortOrder: i,
              keywords: [],
              tenantId
            })) || []
          },
          goals: {
            create: dto.goals?.map((g) => ({ 
              label: g.label, 
              targetMetric: g.target,
              tenantId
            })) || []
          }
        }
      });
    });
  }

  async getHistory(tenantId: string) {
    return this.prisma.brandDNA.findMany({
      where: { tenantId },
      orderBy: { version: 'desc' }
    });
  }

  async scanInstagram(tenantId: string, dto: ScanInstagramDto) {
    return {
      status: 'draft',
      businessName: `${dto.handle} Business`,
      primaryPersona: 'Instagram followers',
      autoPopulated: true,
      message: 'This is a mocked payload. Technician must review.'
    };
  }

  async scanWebsite(tenantId: string, dto: ScanWebsiteDto) {
    return {
      status: 'draft',
      businessName: `Website Brand`,
      primaryPersona: 'Website visitors',
      autoPopulated: true,
    };
  }

  async getGoldenExamples(tenantId: string) {
    return this.prisma.goldenExample.findMany({
      where: { tenantId }
    });
  }

  async approveGoldenExample(tenantId: string, exampleId: string) {
    return this.prisma.goldenExample.update({
      where: { id: exampleId },
      data: { isApproved: true, isPending: false, approvedAt: new Date() }
    });
  }

  async deleteGoldenExample(tenantId: string, exampleId: string) {
    return this.prisma.goldenExample.delete({
      where: { id: exampleId }
    });
  }

  async uploadLogo(tenantId: string, file: Express.Multer.File) {
    if (!firebaseStorage) throw new Error('Firebase storage not configured');
    const bucket = firebaseStorage.bucket();
    const ext = file.originalname.split('.').pop() || 'png';
    const filePath = `logos/${tenantId}/logo_${Date.now()}.${ext}`;
    const fileRef = bucket.file(filePath);
    await fileRef.save(file.buffer, { contentType: file.mimetype, public: true });
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return { url };
  }

  async uploadMoodboard(tenantId: string, file: Express.Multer.File) {
    if (!firebaseStorage) throw new Error('Firebase storage not configured');
    const bucket = firebaseStorage.bucket();
    const ext = file.originalname.split('.').pop() || 'jpg';
    const filePath = `moodboards/${tenantId}/mb_${Date.now()}.${ext}`;
    const fileRef = bucket.file(filePath);
    await fileRef.save(file.buffer, { contentType: file.mimetype, public: true });
    const url = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
    return { url };
  }
}
