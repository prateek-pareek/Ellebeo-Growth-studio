import { Module } from '@nestjs/common';
import { PublicConsentController } from './public-consent.controller';
import { PublicConsentService } from './public-consent.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [PublicConsentController],
  providers: [PublicConsentService],
})
export class PublicConsentModule {}
