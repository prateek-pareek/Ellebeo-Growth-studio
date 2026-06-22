import { Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsGateway } from './notifications.gateway';
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
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: NotificationsGateway,
  ) {}

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

    try {
      this.gateway?.emit(dto.tenantId, {
        id: notif.id,
        type: notif.type,
        title: notif.title,
        body: notif.body,
        data: notif.data,
        createdAt: notif.createdAt,
      });
    } catch {
      // non-fatal
    }

    // Queue only for SMS delivery (async, non-blocking)
    if (dto.sms) {
      notificationsQueue.add('deliver', { notificationId: notif.id }).catch(() => {});
    }

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
