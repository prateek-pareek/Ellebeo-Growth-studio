import { Module } from '@nestjs/common';
import { FeatureFlagController } from './feature-flag.controller';
import { FeatureFlagService } from './feature-flag.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  controllers: [FeatureFlagController],
  providers: [FeatureFlagService, PrismaService],
  exports: [FeatureFlagService],
})
export class FeatureFlagModule {}
