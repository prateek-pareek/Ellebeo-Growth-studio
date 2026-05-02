import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TenantStatusGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Added by JwtAuthGuard

    if (!user || !user.tenantId) {
      return true; // Let the endpoint decide if tenant is strictly required
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: user.tenantId },
      select: { status: true },
    });

    if (!tenant) {
      throw new ForbiddenException('Tenant not found');
    }

    if (tenant.status === 'suspended') {
      throw new ForbiddenException('Your account has been suspended. Please contact support.');
    }

    return true;
  }
}
