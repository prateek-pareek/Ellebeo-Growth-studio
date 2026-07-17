import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';
import { getAllowedOrigins } from '../config/cors';

interface DecodedAccessToken {
  tenantId?: string;
  role?: string;
}

@WebSocketGateway({
  cors: {
    origin: getAllowedOrigins(),
    credentials: true,
  },
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  constructor(private configService: ConfigService) {}

  async handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth.token || client.handshake.headers['authorization']?.split(' ')[1];
      if (!token) throw new Error('No token');

      const secret = this.configService.getOrThrow<string>('JWT_ACCESS_SECRET');
      const decoded = jwt.verify(token, secret) as DecodedAccessToken;

      const tenantId = decoded.tenantId;
      if (tenantId) {
        client.join(`tenant_${tenantId}`);
      }

      if (decoded.role === 'admin' || decoded.role === 'super_admin') {
        client.join('admin_room');
      }

    } catch {
      client.disconnect();
    }
  }

  handleDisconnect(_client: Socket) {
  }

  emitToTenant(tenantId: string, event: string, payload: unknown) {
    this.server.to(`tenant_${tenantId}`).emit(event, payload);
  }

  emitToAdmins(event: string, payload: unknown) {
    this.server.to('admin_room').emit(event, payload);
  }
}
