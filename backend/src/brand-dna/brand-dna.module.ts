import { Module } from '@nestjs/common';
import { BrandDnaController } from './brand-dna.controller';
import { BrandDnaV2Controller } from './v2/brand-dna-v2.controller';
import { BrandDnaService } from './brand-dna.service';
import { MoodboardExtractorService } from '../ai/services/moodboard-extractor.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BrandDnaController, BrandDnaV2Controller],
  providers: [BrandDnaService, MoodboardExtractorService],
})
export class BrandDnaModule {}
