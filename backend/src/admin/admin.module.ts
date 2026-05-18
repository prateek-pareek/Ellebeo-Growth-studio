import { Module } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';
import { MasterPromptController } from './master-prompt.controller';
import { MasterPromptService } from './master-prompt.service';
import { RolesGuard } from '../auth/guards/roles.guard';

@Module({
  controllers: [AdminController, MasterPromptController],
  providers: [AdminService, MasterPromptService, RolesGuard, Reflector],
})
export class AdminModule {}
