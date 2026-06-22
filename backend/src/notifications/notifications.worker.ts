import { Worker } from 'bullmq';
import { PrismaClient } from '@prisma/client';
import { NOTIFICATIONS_QUEUE, notificationQueueConnection } from './notification-queue';

export function startNotificationsWorker(
  prisma: PrismaClient,
  gateway: { emit: (tenantId: string, n: any) => void },
  sms: { sendSms: (to: string, body: string) => Promise<void> },
) {
  const worker = new Worker(
    NOTIFICATIONS_QUEUE,
    async (job) => {
      const { notificationId } = job.data as { notificationId: string };

      const notif = await prisma.notification.findUnique({
        where: { id: notificationId },
        include: { tenant: true },
      });
      if (!notif || notif.deliveredAt) return;

      let deliveryError: string | null = null;

      // 1. Real-time WebSocket
      try {
        gateway.emit(notif.tenantId, {
          id: notif.id,
          type: notif.type,
          title: notif.title,
          body: notif.body,
          data: notif.data,
          createdAt: notif.createdAt,
        });
      } catch (e: any) {
        deliveryError = `ws_failed:${e.message}`;
      }

      // 2. SMS via Twilio (only if opted-in and phone available)
      if (notif.channelSms) {
        const phone = notif.externalPhone ?? notif.tenant?.phone ?? null;
        if (phone) {
          try {
            await sms.sendSms(phone, `${notif.title}: ${notif.body}`);
          } catch (e: any) {
            deliveryError = (deliveryError ? deliveryError + ';' : '') + `sms_failed:${e.message}`;
          }
        }
      }

      await prisma.notification.update({
        where: { id: notif.id },
        data: { deliveredAt: new Date(), deliveryError },
      });
    },
    { connection: notificationQueueConnection, concurrency: 10 },
  );

  worker.on('failed', () => {});

  return worker;
}
