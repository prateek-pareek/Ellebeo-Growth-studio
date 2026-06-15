import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { NotificationsService } from './notifications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsGateway } from './notifications.gateway';
import { SmsService } from './sms.service';
import { PrismaService } from '../prisma/prisma.service';

@Module({
  imports: [ConfigModule],
  controllers: [NotificationsController],
  providers: [NotificationsGateway, SmsService, PrismaService, NotificationsService],
  exports: [NotificationsService, NotificationsGateway, SmsService, PrismaService],
})
export class NotificationsModule {}
