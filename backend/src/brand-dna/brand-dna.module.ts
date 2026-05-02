import { Module } from '@nestjs/common';
import { BrandDnaController } from './brand-dna.controller';
import { BrandDnaService } from './brand-dna.service';

@Module({
  controllers: [BrandDnaController],
  providers: [BrandDnaService],
})
export class BrandDnaModule {}
