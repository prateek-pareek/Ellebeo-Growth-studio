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
    if (!dna) throw new NotFoundException('Brand DNA not found');
    return dna;
  }

  async createOrUpdateDna(tenantId: string, dto: CreateBrandDnaDto) {
    // Transaction to deprecate old DNA and create new one
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.brandDNA.findUnique({
        where: { unique_current_brand_dna: { tenantId, isCurrent: true } }
      });

      if (current) {
        await tx.brandDNA.update({
          where: { id: current.id },
          data: { isCurrent: false }
        });
      }

      return tx.brandDNA.create({
        data: {
          tenantId,
          businessName: dto.businessName,
          oneLiner: dto.oneLiner,
          uniqueSellingProposition: dto.uniqueSellingProposition,
          primaryPersona: dto.primaryPersona,
          primaryTone: dto.primaryTone,
          aestheticDirection: dto.aestheticDirection as any,
          brandTier: dto.brandTier as any,
          pillars: {
            create: dto.pillars?.map((label, i) => ({ label, sort_order: i })) || []
          },
          goals: {
            create: dto.goals?.map((g) => ({ label: g.label, target_metric: g.target })) || []
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
    // Placeholder for GPT-4o-mini scrape and analysis
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
