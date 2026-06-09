import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import * as jwt from 'jsonwebtoken';

@WebSocketGateway({ namespace: 'notifications', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token
        ?? client.handshake.headers?.authorization?.replace('Bearer ', '');
      if (!token) { client.disconnect(); return; }

      const secret = this.config.get<string>('JWT_ACCESS_SECRET');
      if (!secret) { client.disconnect(); return; }

      const payload = jwt.verify(token, secret) as any;
      const tenantId = payload.tenantId;
      if (!tenantId) { client.disconnect(); return; }

      client.join(`tenant:${tenantId}`);
      console.log(`[NotificationsGateway] Client ${client.id} joined tenant:${tenantId}`);

      // Push any unread notifications created in the last 10 minutes they may have missed
      const missed = await this.prisma.notification.findMany({
        where: {
          tenantId,
          readAt: null,
          createdAt: { gte: new Date(Date.now() - 10 * 60 * 1000) },
        },
        orderBy: { createdAt: 'asc' },
        take: 10,
      });

      for (const n of missed) {
        client.emit('notification:new', {
          id: n.id,
          type: n.type,
          title: n.title,
          body: n.body,
          data: n.data,
          createdAt: n.createdAt,
        });
      }
    } catch (e) {
      console.error('[NotificationsGateway] Auth failed:', e);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    client.rooms.forEach(room => client.leave(room));
  }

  emit(tenantId: string, notification: any) {
    if (!this.server) {
      console.warn('[NotificationsGateway] server not ready yet, skipping emit');
      return;
    }
    this.server.to(`tenant:${tenantId}`).emit('notification:new', notification);
  }
}
