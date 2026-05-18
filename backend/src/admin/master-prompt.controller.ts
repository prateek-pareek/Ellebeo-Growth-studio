import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { MasterPromptService } from './master-prompt.service';
import { CreateMasterPromptDto, UpdateMasterPromptDto } from './dto/master-prompt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole, PromptCategory } from '@prisma/client';

@Controller('admin/master-prompts')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.admin, UserRole.super_admin)
export class MasterPromptController {
  constructor(private readonly masterPromptService: MasterPromptService) {}

  @Post()
  create(@Body() createMasterPromptDto: CreateMasterPromptDto) {
    return this.masterPromptService.create(createMasterPromptDto);
  }

  @Get()
  findAll() {
    return this.masterPromptService.findAll();
  }

  @Get('active')
  findActiveByCategory(@Query('category') category: PromptCategory) {
    return this.masterPromptService.findActiveByCategory(category);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.masterPromptService.findOne(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateMasterPromptDto: UpdateMasterPromptDto,
  ) {
    return this.masterPromptService.update(id, updateMasterPromptDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.masterPromptService.delete(id);
  }
}
