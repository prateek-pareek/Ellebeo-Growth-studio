import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MasterPromptController } from './master-prompt.controller';
import { MasterPromptService } from './master-prompt.service';

@Module({
  controllers: [AdminController, MasterPromptController],
  providers: [AdminService, MasterPromptService],
})
export class AdminModule {}
