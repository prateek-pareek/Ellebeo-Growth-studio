import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMasterPromptDto, UpdateMasterPromptDto } from './dto/master-prompt.dto';
import { PromptCategory } from '@prisma/client';

@Injectable()
export class MasterPromptService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateMasterPromptDto) {
    if (dto.isActive) {
      await this.deactivateCategory(dto.category);
    }
    
    return this.prisma.masterPrompt.create({
      data: dto,
    });
  }

  async findAll() {
    return this.prisma.masterPrompt.findMany({
      orderBy: { createdAt: 'desc' },
    });
  }

  async findActiveByCategory(category: PromptCategory) {
    return this.prisma.masterPrompt.findFirst({
      where: {
        category,
        isActive: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const prompt = await this.prisma.masterPrompt.findUnique({ where: { id } });
    if (!prompt) throw new NotFoundException('MasterPrompt not found');
    return prompt;
  }

  async update(id: string, dto: UpdateMasterPromptDto) {
    const existing = await this.findOne(id);
    
    if (dto.isActive && !existing.isActive) {
      await this.deactivateCategory(existing.category);
    }

    return this.prisma.masterPrompt.update({
      where: { id },
      data: dto,
    });
  }

  async delete(id: string) {
    await this.findOne(id);
    return this.prisma.masterPrompt.delete({ where: { id } });
  }

  private async deactivateCategory(category: PromptCategory) {
    await this.prisma.masterPrompt.updateMany({
      where: { category, isActive: true },
      data: { isActive: false },
    });
  }
}
