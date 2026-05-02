import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { AppointmentService } from './appointment.service';
import { CreateAppointmentDto, UpdateAppointmentDto, CancelAppointmentDto, UploadUrlRequestDto, ConfirmUploadDto } from './dto/appointment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('appointments')
export class AppointmentController {
  constructor(private readonly appointmentService: AppointmentService) {}

  @Get()
  getAppointments(@Req() req: any) {
    return this.appointmentService.getAppointments(req.user.tenantId);
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

  @Delete(':id/images/:imageId')
  deleteImage(@Req() req: any, @Param('id') id: string, @Param('imageId') imageId: string) {
    return this.appointmentService.deleteImage(req.user.tenantId, id, imageId);
  }

  @Get(':id/content')
  getContent(@Req() req: any, @Param('id') id: string) {
    return this.appointmentService.getContent(req.user.tenantId, id);
  }
}
