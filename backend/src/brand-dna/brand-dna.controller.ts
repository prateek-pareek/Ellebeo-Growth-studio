import { Controller, Get, Post, Put, Delete, Body, Param, Req, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { BrandDnaService } from './brand-dna.service';
import { CreateBrandDnaDto, ScanInstagramDto, ScanWebsiteDto } from './dto/brand-dna.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('brand-dna')
export class BrandDnaController {
  constructor(private readonly brandDnaService: BrandDnaService) {}

  @Post('upload-logo')
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.brandDnaService.uploadLogo(req.user.tenantId, file);
  }

  @Post('upload-moodboard')
  @UseInterceptors(FileInterceptor('file'))
  uploadMoodboard(@Req() req: any, @UploadedFile() file: Express.Multer.File) {
    return this.brandDnaService.uploadMoodboard(req.user.tenantId, file);
  }

  @Get()
  getCurrentDna(@Req() req: any) {
    return this.brandDnaService.getCurrentDna(req.user.tenantId);
  }

  @Post()
  createDna(@Req() req: any, @Body() dto: CreateBrandDnaDto) {
    return this.brandDnaService.createOrUpdateDna(req.user.tenantId, dto);
  }

  @Put()
  updateDna(@Req() req: any, @Body() dto: CreateBrandDnaDto) {
    return this.brandDnaService.createOrUpdateDna(req.user.tenantId, dto);
  }

  @Get('history')
  getHistory(@Req() req: any) {
    return this.brandDnaService.getHistory(req.user.tenantId);
  }

  @Post('scan-instagram')
  scanInstagram(@Req() req: any, @Body() dto: ScanInstagramDto) {
    return this.brandDnaService.scanInstagram(req.user.tenantId, dto);
  }

  @Post('scan-website')
  scanWebsite(@Req() req: any, @Body() dto: ScanWebsiteDto) {
    return this.brandDnaService.scanWebsite(req.user.tenantId, dto);
  }

  @Get('golden-examples')
  getGoldenExamples(@Req() req: any) {
    return this.brandDnaService.getGoldenExamples(req.user.tenantId);
  }

  @Post('golden-examples/:id/approve')
  approveGoldenExample(@Req() req: any, @Param('id') id: string) {
    return this.brandDnaService.approveGoldenExample(req.user.tenantId, id);
  }

  @Delete('golden-examples/:id')
  deleteGoldenExample(@Req() req: any, @Param('id') id: string) {
    return this.brandDnaService.deleteGoldenExample(req.user.tenantId, id);
  }
}
