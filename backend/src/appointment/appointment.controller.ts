import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards, Query, UploadedFile, UseInterceptors, ParseFilePipe, MaxFileSizeValidator } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto, UpdateAppointmentDto, CancelAppointmentDto, UploadUrlRequestDto, ConfirmUploadDto, PaginationQueryDto } from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';
import { ContentModerationService } from '../ai/guards/content-moderation.service';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(
    private readonly appointmentService: AppointmentService,
    private readonly moderation: ContentModerationService,
  ) {}

  @Post('check-image')
  @UseInterceptors(FileInterceptor('file'))
  async checkImage(@UploadedFile() file: Express.Multer.File) {
    if (!file) return { safe: true, reason: 'No file provided' };
    // Convert buffer to base64 data URL so Claude can analyse it without Firebase
    const base64 = file.buffer.toString('base64');
    const dataUrl = `data:${file.mimetype};base64,${base64}`;
    const result = await this.moderation.moderateImage(dataUrl);
    this.moderation.assertImageSafe(result);
    return { safe: true, reason: result.reason };
  }

  @Get()
  getAppointments(@Req() req: any, @Query() query: PaginationQueryDto) {
    return this.appointmentService.getAppointments(req.user.tenantId, query.page, query.pageSize);
  }

  @Post()
  createAppointment(@Req() req: any, @Body() dto: CreateAppointmentDto) {
    return this.appointmentService.createAppointment(req.user.tenantId, dto);
  }

  @Get(':id')
  getAppointment(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.getAppointment(req.user.tenantId, id);
  }

  @Patch(':id')
  updateAppointment(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.appointmentService.updateAppointment(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  deleteAppointment(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.deleteAppointment(req.user.tenantId, id);
  }

  @Post(':id/cancel')
  cancelAppointment(@Req() req: any, @Param('id') id: string, @Body() dto: CancelAppointmentDto) {
    return this.appointmentService.cancelAppointment(req.user.tenantId, id, dto);
  }

  @Get(':id/images')
  getImages(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.getImages(req.user.tenantId, id);
  }

  @Post(':id/images/upload-url')
  generateUploadUrl(@Req() req: any, @Param('id') id: string, @Body() dto: UploadUrlRequestDto) {
    return this.appointmentService.generateUploadUrl(req.user.tenantId, id, dto);
  }

  @Post(':id/images/confirm-upload')
  confirmUpload(@Req() req: any, @Param('id') id: string, @Body() dto: ConfirmUploadDto) {
    return this.appointmentService.confirmUpload(req.user.tenantId, id, dto, dto.isBeforePhoto ?? false);
  }

  @Post(':id/images/upload')
  @UseInterceptors(FileInterceptor('file'))
  uploadImage(
    @Req() req: any,
    @Param('id') id: string,
    @UploadedFile(new ParseFilePipe({ validators: [new MaxFileSizeValidator({ maxSize: 20 * 1024 * 1024 })] })) file: Express.Multer.File,
    @Body('isBeforePhoto') isBeforePhoto: string,
  ) {
    return this.appointmentService.uploadImageDirect(req.user.tenantId, id, file, isBeforePhoto === 'true');
  }

  @Delete(':id/images/:imageId')
  deleteImage(@Req() req: any, @Param('id') id: string, @Param('imageId') imageId: string) {
    return this.appointmentService.deleteImage(req.user.tenantId, id, imageId);
  }

  @Get(':id/content')
  getContent(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.getContent(req.user.tenantId, id);
  }

  @Post(':id/send-consent-reminder')
  sendConsentReminder(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.sendConsentReminder(req.user.tenantId, id);
  }
}
