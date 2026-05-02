import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class GenerationRestrictionGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; 

    if (!user || !user.tenantId) {
      throw new ForbiddenException('Tenant context required for generation');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { generationRestricted: true, generationSuspended: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    if (tenant.generationSuspended) {
      throw new ForbiddenException('Generation capabilities have been suspended for your account.');
    }

    if (tenant.generationRestricted) {
      throw new ForbiddenException('Generation capabilities are currently restricted.');
    }

    return true;
  }
}
