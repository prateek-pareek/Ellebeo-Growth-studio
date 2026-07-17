import { Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

// Matches JwtStrategy.validate()'s return shape, which becomes req.user.
type JwtUser = { userId: string; role: string; tenantId?: string };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = JwtUser>(err: Error | null, user: TUser | false, info: unknown): TUser {
    if (err || !user) {
      throw err || new UnauthorizedException('Authentication token is missing or invalid');
    }
    return user;
  }
}
