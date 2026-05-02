import { Controller, Get, Post, Patch, Delete, Body, Param, Req, UseGuards } from '@nestjs/common';
import { ClientService } from './client.service';
import { CreateClientDto, UpdateClientDto, UpsertConsentDto, WithdrawConsentDto } from './dto/client.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantStatusGuard } from '../common/guards/tenant-status.guard';

@UseGuards(JwtAuthGuard, TenantStatusGuard)
@Controller('clients')
export class ClientController {
  constructor(private readonly clientService: ClientService) {}

  @Get()
  getClients(@Req() req: any) {
    return this.clientService.getClients(req.user.tenantId);
  }

  @Post()
  createClient(@Req() req: any, @Body() dto: CreateClientDto) {
    return this.clientService.createClient(req.user.tenantId, dto);
  }

  @Get(':id')
  getClient(@Req() req: any, @Param('id') id: string) {
    return this.clientService.getClient(req.user.tenantId, id);
  }

  @Patch(':id')
  updateClient(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateClientDto) {
    return this.clientService.updateClient(req.user.tenantId, id, dto);
  }

  @Delete(':id')
  deleteClient(@Req() req: any, @Param('id') id: string) {
    return this.clientService.deleteClient(req.user.tenantId, id);
  }

  @Get(':id/consent')
  getConsent(@Req() req: any, @Param('id') id: string) {
    return this.clientService.getConsent(req.user.tenantId, id);
  }

  @Post(':id/consent')
  createConsent(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertConsentDto) {
    return this.clientService.upsertConsent(req.user.tenantId, id, dto);
  }

  @Patch(':id/consent')
  updateConsent(@Req() req: any, @Param('id') id: string, @Body() dto: UpsertConsentDto) {
    return this.clientService.upsertConsent(req.user.tenantId, id, dto);
  }

  @Post(':id/consent/withdraw')
  withdrawConsent(@Req() req: any, @Param('id') id: string, @Body() dto: WithdrawConsentDto) {
    return this.clientService.withdrawConsent(req.user.tenantId, id, dto);
  }

  @Get(':id/appointments')
  getAppointments(@Req() req: any, @Param('id') id: string) {
    return this.clientService.getAppointments(req.user.tenantId, id);
  }
}
