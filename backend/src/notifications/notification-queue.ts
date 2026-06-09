import { Queue, Worker } from 'bullmq';

const connection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: parseInt(process.env['REDIS_PORT'] ?? '6379', 10),
  password: process.env['REDIS_PASSWORD'],
  tls: process.env['REDIS_TLS'] === 'true' ? {} : undefined,
};

export const NOTIFICATIONS_QUEUE = 'platform-notifications';

export const notificationsQueue = new Queue(NOTIFICATIONS_QUEUE, { connection });

export { connection as notificationQueueConnection };
