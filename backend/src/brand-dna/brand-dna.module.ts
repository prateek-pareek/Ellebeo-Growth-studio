import { Module } from '@nestjs/common';
import { BrandDnaController } from './brand-dna.controller';
import { BrandDnaService } from './brand-dna.service';
import { MoodboardExtractorService } from '../ai/services/moodboard-extractor.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BrandDnaController],
  providers: [BrandDnaService, MoodboardExtractorService],
})
export class BrandDnaModule {}
