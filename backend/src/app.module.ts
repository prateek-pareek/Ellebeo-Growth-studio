import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
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
import { CrmModule } from './crm/crm.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BillingModule } from './billing/billing.module';
import { PublicConsentModule } from './public-consent/public-consent.module';
import { HealthController } from './health/health.controller';
import { CacheModule } from '@nestjs/cache-manager';
import { TenantContextMiddleware } from './common/middleware/tenant-context.middleware';
import { validateEnv } from './config/env.validation';
// import { AiModule } from './ai/ai.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
      validate: validateEnv,
    }),
    ThrottlerModule.forRoot([{
      ttl: 60000,
      limit: 200, // 200 requests per minute
    }]),
    // In-memory cache — BullMQ workers still use Redis directly via ioredis.
    // Switched from cache-manager-redis-store to avoid ETIMEDOUT floods when
    // the Redis VPS port is not yet reachable during local development.
    CacheModule.register({
      isGlobal: true,
      ttl: 300, // 5 minutes default TTL
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
    CrmModule,
    NotificationsModule,
    BillingModule,
    PublicConsentModule,
    // AiModule,
  ],
  controllers: [HealthController],
  providers: [
    // ThrottlerModule.forRoot() above only registers config/storage — without
    // this guard nothing actually enforces it, including the @Throttle()
    // overrides on login/refresh in auth.controller.ts.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantContextMiddleware)
      .forRoutes('*');
  }
}
