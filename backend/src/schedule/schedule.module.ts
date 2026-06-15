import { Module } from '@nestjs/common';
import { ScheduleController } from './schedule.controller';
import { SocialOAuthController } from './social-oauth.controller';
import { ScheduleService } from './schedule.service';

@Module({
  controllers: [ScheduleController, SocialOAuthController],
  providers: [ScheduleService],
})
export class ScheduleModule {}
