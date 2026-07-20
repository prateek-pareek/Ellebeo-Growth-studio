import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export type TemplateFilters = {
  format?: string;
  pillar?: string;
  category?: string;
};

@Injectable()
export class TemplateService {
  constructor(private readonly prisma: PrismaService) {}

  findAll(filters: TemplateFilters) {
    return this.prisma.template.findMany({
      where: {
        isActive: true,
        ...(filters.format ? { format: filters.format as any } : {}),
        ...(filters.pillar ? { pillar: filters.pillar } : {}),
        ...(filters.category ? { categories: { has: filters.category } } : {}),
      },
      orderBy: { sortOrder: 'asc' },
    });
  }

  private static readonly UUID_RE =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  async findOne(idOrSlug: string) {
    const template = await this.prisma.template.findFirst({
      where: {
        isActive: true,
        // `id` is a Postgres UUID column — only compare against it when the
        // lookup value is actually UUID-shaped, otherwise Prisma throws.
        ...(TemplateService.UUID_RE.test(idOrSlug)
          ? { OR: [{ id: idOrSlug }, { slug: idOrSlug }] }
          : { slug: idOrSlug }),
      },
    });

    if (!template) {
      throw new NotFoundException(`Template "${idOrSlug}" not found`);
    }

    return template;
  }

  async getCategories(): Promise<string[]> {
    const templates = await this.prisma.template.findMany({
      where: { isActive: true },
      select: { categories: true },
    });
    return Array.from(new Set(templates.flatMap((t) => t.categories))).sort();
  }
}
