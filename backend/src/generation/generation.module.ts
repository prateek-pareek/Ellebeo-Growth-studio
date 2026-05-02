import { Module } from '@nestjs/common';
import { GenerationController } from './generation.controller';
import { GenerationService } from './generation.service';
import { GenerationGateway } from './generation.gateway';

@Module({
  controllers: [GenerationController],
  providers: [GenerationService, GenerationGateway],
})
export class GenerationModule {}
