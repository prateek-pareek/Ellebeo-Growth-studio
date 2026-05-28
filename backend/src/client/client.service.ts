import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { CreateClientDto, UpdateClientDto, UpsertConsentDto, WithdrawConsentDto } from './dto/client.dto';

@Injectable()
export class ClientService {
  constructor(
    private prisma: PrismaService,
    private eventsGateway: EventsGateway,
  ) {}

  async getClients(tenantId: string, page = 1, pageSize = 20) {
    const safePage = Number.isFinite(page) ? Math.max(1, Number(page)) : 1;
    const safePageSize = Number.isFinite(pageSize) ? Math.min(100, Math.max(1, Number(pageSize))) : 20;
    return this.prisma.client.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { lastVisitAt: 'desc' },
      skip: (safePage - 1) * safePageSize,
      take: safePageSize,
    });
  }

  async getClient(tenantId: string, id: string) {
    const client = await this.prisma.client.findUnique({
      where: { id }
    });
    if (!client || client.tenantId !== tenantId || client.deletedAt) {
      throw new NotFoundException('Client not found');
    }
    return client;
  }

  async createClient(tenantId: string, dto: CreateClientDto) {
    return this.prisma.client.create({
      data: { ...dto, tenantId }
    });
  }

  async updateClient(tenantId: string, id: string, dto: UpdateClientDto) {
    await this.getClient(tenantId, id); // verify ownership
    return this.prisma.client.update({
      where: { id },
      data: dto
    });
  }

  async deleteClient(tenantId: string, id: string) {
    await this.getClient(tenantId, id);
    return this.prisma.client.update({
      where: { id },
      data: { deletedAt: new Date(), isActive: false }
    });
  }

  async getConsent(tenantId: string, id: string) {
    await this.getClient(tenantId, id);
    return this.prisma.consentRecord.findFirst({
      where: { clientId: id, tenantId, isCurrent: true }
    });
  }

  async upsertConsent(tenantId: string, id: string, dto: UpsertConsentDto) {
    await this.getClient(tenantId, id);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.consentRecord.findFirst({
        where: { clientId: id, tenantId, isCurrent: true }
      });

      if (current) {
        await tx.consentRecord.update({
          where: { id: current.id },
          data: { isCurrent: false, supersededAt: new Date() }
        });
      }

      const newConsent = await tx.consentRecord.create({
        data: {
          ...dto,
          tenantId,
          clientId: id,
          status: 'granted',
          grantedAt: new Date(),
          isCurrent: true,
        }
      });

      // Link all active appointments for this client to the new consent record
      await tx.appointment.updateMany({
        where: { clientId: id, tenantId, deletedAt: null },
        data: { consentRecordId: newConsent.id },
      });

      return newConsent;
    });
  }

  async withdrawConsent(tenantId: string, id: string, dto: WithdrawConsentDto) {
    await this.getClient(tenantId, id);

    const consent = await this.prisma.consentRecord.findFirst({
      where: { clientId: id, tenantId, isCurrent: true }
    });

    if (!consent) throw new NotFoundException('Consent record not found');

    // Trigger the database cascade block by updating status
    const updatedConsent = await this.prisma.consentRecord.update({
      where: { id: consent.id },
      data: {
        status: 'withdrawn',
        withdrawalReason: dto.withdrawalReason,
      }
    });

    // Find affected items to return
    const blockedContent = await this.prisma.contentItem.findMany({
      where: { appointment: { clientId: id }, status: 'blocked' }
    });
    
    const cancelledPosts = await this.prisma.scheduledPost.findMany({
      where: { contentItem: { appointment: { clientId: id } }, publishStatus: 'cancelled' }
    });

    // Emit event to tenant
    this.eventsGateway.emitToTenant(tenantId, 'consent:withdrawn', {
      clientId: id,
      consentId: consent.id,
      blockedContentCount: blockedContent.length,
      cancelledPostsCount: cancelledPosts.length,
    });

    return {
      consent: updatedConsent,
      blockedContent,
      cancelledPosts
    };
  }

  async getAppointments(tenantId: string, id: string) {
    await this.getClient(tenantId, id);
    return this.prisma.appointment.findMany({
      where: { clientId: id, tenantId, deletedAt: null },
      orderBy: { appointmentDate: 'desc' }
    });
  }
}
