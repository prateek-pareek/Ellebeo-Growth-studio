import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PublicConsentService {
  constructor(private readonly prisma: PrismaService) {}

  async getConsentByToken(token: string) {
    const record = await this.prisma.consentRecord.findUnique({
      where: { consentToken: token },
      include: {
        appointment: {
          select: {
            id: true,
            serviceName: true,
            appointmentDate: true,
          },
        },
        client: {
          select: { firstName: true, lastName: true },
        },
        tenant: {
          select: { businessName: true, displayName: true },
        },
      },
    });

    if (!record) throw new NotFoundException('Consent link not found or invalid.');

    if (record.consentTokenUsedAt) {
      throw new BadRequestException('This consent link has already been used.');
    }

    if (record.consentTokenExpiresAt && record.consentTokenExpiresAt < new Date()) {
      throw new BadRequestException('This consent link has expired. Please ask your technician to send a new one.');
    }

    const techName = record.tenant.displayName || record.tenant.businessName;

    return {
      clientFirstName: record.client.firstName,
      technicianName: techName,
      service: record.appointment?.serviceName ?? null,
      appointmentDate: record.appointment?.appointmentDate ?? null,
      currentPermissions: {
        allowShowFace: record.allowShowFace,
        allowUseName: record.allowUseName,
        allowTagSocial: record.allowTagSocial,
        allowPlatformPromotion: record.allowPlatformPromotion,
        allowInternalUse: record.allowInternalUse,
        allowMarketingContent: record.allowMarketingContent,
      },
    };
  }

  async grantConsentByToken(
    token: string,
    permissions: {
      allowShowFace: boolean;
      allowUseName: boolean;
      allowTagSocial: boolean;
      allowPlatformPromotion: boolean;
      allowInternalUse: boolean;
      allowMarketingContent: boolean;
    },
    ip: string,
    device: string,
  ) {
    const record = await this.prisma.consentRecord.findUnique({
      where: { consentToken: token },
    });

    if (!record) throw new NotFoundException('Consent link not found or invalid.');

    if (record.consentTokenUsedAt) {
      throw new BadRequestException('This consent link has already been used.');
    }

    if (record.consentTokenExpiresAt && record.consentTokenExpiresAt < new Date()) {
      throw new BadRequestException('This consent link has expired. Please ask your technician to send a new one.');
    }

    await this.prisma.consentRecord.update({
      where: { id: record.id },
      data: {
        status: 'granted',
        allowShowFace: permissions.allowShowFace,
        allowUseName: permissions.allowUseName,
        allowTagSocial: permissions.allowTagSocial,
        allowPlatformPromotion: permissions.allowPlatformPromotion,
        allowInternalUse: permissions.allowInternalUse,
        allowMarketingContent: permissions.allowMarketingContent,
        consentMethod: 'sms_link',
        grantedAt: new Date(),
        consentTokenUsedAt: new Date(),
        consentGrantedIp: ip,
        consentGrantedDevice: device,
      },
    });

    return { success: true };
  }
}
