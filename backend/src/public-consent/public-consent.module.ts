import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PublicConsentController } from './public-consent.controller';
import { PublicConsentService } from './public-consent.service';
import { PrismaModule } from '../prisma/prisma.module';
import { SmsService } from '../notifications/sms.service';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [PublicConsentController],
  providers: [PublicConsentService, SmsService],
})
export class PublicConsentModule {}
