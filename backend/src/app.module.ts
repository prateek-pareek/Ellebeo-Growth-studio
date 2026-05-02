import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { TenantModule } from './tenant/tenant.module';
import { BrandDnaModule } from './brand-dna/brand-dna.module';
import { ClientModule } from './client/client.module';
import { AppointmentModule } from './appointment/appointment.module';
import { ContentModule } from './content/content.module';
import { GenerationModule } from './generation/generation.module';
import { ScheduleModule } from './schedule/schedule.module';
import { CampaignModule } from './campaign/campaign.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { EventsModule } from './events/events.module';
import { FirebaseModule } from './common/firebase/firebase.module';
import { CacheModule } from '@nestjs/cache-manager';
import * as redisStore from 'cache-manager-redis-store';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
// import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 200, // 200 requests per minute
    }]),
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
    }),
    PrismaModule,
    AuthModule,
    TenantModule,
    BrandDnaModule,
    ClientModule,
    AppointmentModule,
    ContentModule,
    GenerationModule,
    ScheduleModule,
    CampaignModule,
    DashboardModule,
    AdminModule,
    EventsModule,
    FirebaseModule,
    // AiModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes('*');
  }
}
