import { Global, Module } from '@nestjs/common';
import { EventsGateway } from './events.gateway';
import { ConfigModule } from '@nestjs/config';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [EventsGateway],
  exports: [EventsGateway],
})
export class EventsModule {}
