import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { TemplateService } from './template.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('templates')
export class TemplateController {
  constructor(private readonly templateService: TemplateService) {}

  @Get()
  findAll(
    @Query('format') format?: string,
    @Query('pillar') pillar?: string,
    @Query('category') category?: string,
  ) {
    return this.templateService.findAll({ format, pillar, category });
  }

  @Get('categories')
  getCategories() {
    return this.templateService.getCategories();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.templateService.findOne(id);
  }
}
