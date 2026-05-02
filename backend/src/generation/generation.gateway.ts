import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
} from '@nestjs/websockets';
import { Socket, Server } from 'socket.io';
import { WebSocketServer } from '@nestjs/websockets';

@WebSocketGateway({ namespace: 'generation', cors: { origin: true, credentials: true } })
export class GenerationGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(GenerationGateway.name);

  @WebSocketServer()
  server!: Server;

  handleConnection(client: Socket) {
    this.logger.debug(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.debug(`Client disconnected: ${client.id}`);
  }

  @SubscribeMessage('generation:join')
  handleJoin(@ConnectedSocket() client: Socket, @MessageBody() payload: { jobId?: string }) {
    if (!payload?.jobId) return;
    client.join(payload.jobId);
  }

  emitJobUpdate(jobId: string, state: string) {
    this.server.to(jobId).emit('generation:update', { jobId, state });
  }
}
