import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const user = request.user; // Added by JwtAuthGuard

    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      throw new ForbiddenException('Admin access required');
    }

    return true;
  }
}
