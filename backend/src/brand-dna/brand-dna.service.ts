import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBrandDnaDto, ScanInstagramDto, ScanWebsiteDto } from './dto/brand-dna.dto';

@Injectable()
export class BrandDnaService {
  constructor(private prisma: PrismaService) {}

  async getCurrentDna(tenantId: string) {
    const dna = await this.prisma.brandDNA.findUnique({
      where: { unique_current_brand_dna: { tenantId, isCurrent: true } },
      include: { pillars: true, goals: true }
    });
    return dna;
  }

  async createOrUpdateDna(tenantId: string, dto: CreateBrandDnaDto) {
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.brandDNA.findUnique({
        where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
      });

      const nextVersion = current ? current.version + 1 : 1;

      if (current) {
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
          vocabularyPreferred: dto.voiceDo || [],
          doNotSay: dto.voiceDont || [],
          aestheticDirection: dto.aestheticDirection as any,
          brandTier: dto.brandTier as any,
          primaryBrandColor: dto.primaryBrandColor,
          secondaryBrandColor: dto.secondaryBrandColor,
          emojiPolicy: dto.emojiPolicy || 'minimal',
          captionLengthPreference: dto.captionLengthPreference || 'medium',
          pillars: {
            create: dto.pillars?.map((label, i) => ({ 
              label, 
              sortOrder: i,
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
}
