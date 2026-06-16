import { Module } from '@nestjs/common';
import { AppointmentController } from './appointment.controller';
import { AppointmentService } from './appointment.service';
import { ConfigModule } from '@nestjs/config';
import { FirebaseModule } from '../common/firebase/firebase.module';
import { ContentModerationService } from '../ai/guards/content-moderation.service';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [ConfigModule, FirebaseModule, NotificationsModule],
  controllers: [AppointmentController],
  providers: [AppointmentService, ContentModerationService],
})
export class AppointmentModule {}
