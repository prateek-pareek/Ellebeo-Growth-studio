import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly tenantScopedModels = new Set([
    'BrandDNA', 'Client', 'ConsentRecord', 'Appointment',
    'ImageAsset', 'ContentItem', 'GenerationJob', 'ScheduledPost',
    'Campaign', 'SocialAccount', 'BusinessGoal', 'GoldenExample',
  ]);

  private readonly softDeleteModels = new Set([
    'Tenant', 'Client', 'Appointment', 'ImageAsset', 'ContentItem', 'Campaign', 'User',
  ]);

  constructor() {
    super();
    this.$use(async (params, next) => {
      const timeoutMs = 10_000;
      const queryPromise = next(params);
      
      // Prevent unhandled promise rejection crashing the server if the query fails AFTER the timeout
      queryPromise.catch(() => {});

      return Promise.race([
        queryPromise,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Prisma query timeout after ${timeoutMs}ms`)), timeoutMs),
        ),
      ]);
    });

    this.$use(async (params, next) => {
      const isFindAction = ['findMany', 'count', 'aggregate'].includes(params.action);
      if (params.model && this.tenantScopedModels.has(params.model) && isFindAction) {
        const where = (params.args?.where ?? {}) as Record<string, unknown>;
        if (where.tenantId === undefined) {
          throw new Error(`Tenant isolation violation: ${params.model}.${params.action} missing tenantId`);
        }
      }
      return next(params);
    });

    this.$use(async (params, next) => {
      const isFindAction = ['findUnique', 'findFirst', 'findMany'].includes(params.action);
      if (params.model && this.softDeleteModels.has(params.model) && isFindAction) {
        params.args = params.args || {};
        params.args.where = params.args.where || {};
        if (params.args.where.deletedAt === undefined) {
          params.args.where.deletedAt = null;
        }
      }
      return next(params);
    });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
