import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { notificationsQueue } from './notification-queue';

export interface SendNotificationDto {
  tenantId: string;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sms?: boolean;
  phone?: string;
}

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async send(dto: SendNotificationDto) {
    const notif = await this.prisma.notification.create({
      data: {
        tenantId: dto.tenantId,
        type: dto.type,
        title: dto.title,
        body: dto.body,
        data: (dto.data ?? {}) as any,
        channelSms: dto.sms ?? false,
        externalPhone: dto.phone ?? null,
      },
    });
    await notificationsQueue.add('deliver', { notificationId: notif.id });
    return notif;
  }

  list(tenantId: string, skip = 0, take = 25) {
    return this.prisma.notification.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    });
  }

  unreadCount(tenantId: string) {
    return this.prisma.notification.count({
      where: { tenantId, readAt: null },
    });
  }

  markRead(tenantId: string, id: string) {
    return this.prisma.notification.updateMany({
      where: { id, tenantId },
      data: { readAt: new Date() },
    });
  }

  markAllRead(tenantId: string) {
    return this.prisma.notification.updateMany({
      where: { tenantId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
