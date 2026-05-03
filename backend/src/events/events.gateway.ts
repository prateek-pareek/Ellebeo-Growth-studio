import {
  WebSocketGateway,
  WebSocketServer,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import { ConfigService } from '@nestjs/config';

@WebSocketGateway({
  cors: {
    origin: '*', // Adjust to your frontend URL in production
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

      const secret = this.configService.get<string>('JWT_SECRET') || 'fallback_secret_for_dev_only';
      const decoded: any = jwt.verify(token, secret);

      const tenantId = decoded.tenantId;
      if (tenantId) {
        client.join(`tenant_${tenantId}`);
        console.log(`Client ${client.id} joined room tenant_${tenantId}`);
      }

      if (decoded.role === 'admin' || decoded.role === 'super_admin') {
        client.join('admin_room');
      }

    } catch (e: any) {
      console.log(`Connection failed for client ${client.id}:`, e.message);
      client.disconnect();
    }
  }

  handleDisconnect(client: Socket) {
    console.log(`Client disconnected: ${client.id}`);
  }

  emitToTenant(tenantId: string, event: string, payload: any) {
    this.server.to(`tenant_${tenantId}`).emit(event, payload);
  }

  emitToAdmins(event: string, payload: any) {
    this.server.to('admin_room').emit(event, payload);
  }
}
