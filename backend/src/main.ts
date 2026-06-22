import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import express from 'express';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { startContentGenerationWorker } from './ai/workers/content-generation.worker';
import { GenerationGateway } from './generation/generation.gateway';
import { NotificationsGateway } from './notifications/notifications.gateway';
import { NotificationsService } from './notifications/notifications.service';
import { SmsService } from './notifications/sms.service';
import { PrismaService } from './prisma/prisma.service';
import { startNotificationsWorker } from './notifications/notifications.worker';

async function bootstrap() {
  // Body parser disabled globally so the Stripe webhook route can access the
  // raw request body (required for signature verification). Re-applied below
  // for every other route.
  const app = await NestFactory.create(AppModule, { bodyParser: false });

  app.use((req: any, res: any, next: any) => {
    if (req.originalUrl === '/api/v1/billing/webhook') {
      express.raw({ type: 'application/json' })(req, res, next);
    } else {
      express.json()(req, res, next);
    }
  });
  app.use(express.urlencoded({ extended: true }));

  // Security Middleware
  app.use(helmet());
  const allowedOrigins = [
    process.env.FRONTEND_URL || 'http://localhost:5173',
    process.env.ADMIN_PORTAL_URL || 'http://localhost:3000',
  ].filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Allow server-to-server requests (no origin) and listed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS: origin ${origin} not allowed`));
      }
    },
    credentials: true,
  });
  
  // Cookie Parser for httpOnly refresh tokens
  app.use(cookieParser());

  // Global Middleware (applied before routing)
  app.use(new RequestIdMiddleware().use);

  // Global Pipes
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // Global Interceptors & Filters
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.useGlobalFilters(new HttpExceptionFilter());

  // Set global prefix if needed
  app.setGlobalPrefix('api/v1');

  const port = process.env.PORT || 8080;
  await app.listen(port);

  // Start BullMQ workers after server is live (so WebSocket servers are ready)
  const generationGateway = app.get(GenerationGateway);
  const notificationsService = app.get(NotificationsService);

  // notifyFn uses NotificationsService which emits WS directly — no queue delay
  const notifyFn = async (dto: { tenantId: string; type: string; title: string; body: string; data?: Record<string, unknown> }) => {
    await notificationsService.send(dto);
  };

  startContentGenerationWorker(generationGateway.server, notifyFn);

  const notificationsGateway = app.get(NotificationsGateway);
  const smsService = app.get(SmsService);
  const prismaService = app.get(PrismaService);
  startNotificationsWorker(prismaService as any, notificationsGateway, smsService);
}

bootstrap();
