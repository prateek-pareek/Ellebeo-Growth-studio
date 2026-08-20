import { Module } from '@nestjs/common';
import { ScoringGateService } from '../ai/services/scoring-gate.service';
import { GeminiLabController } from './gemini-lab.controller';
import { GeminiLabDnaService } from './gemini-lab-dna.service';
import { GeminiLabService } from './gemini-lab.service';

@Module({
  controllers: [GeminiLabController],
  providers: [GeminiLabService, GeminiLabDnaService, ScoringGateService],
  exports: [GeminiLabService, GeminiLabDnaService],
})
export class GeminiLabModule {}
