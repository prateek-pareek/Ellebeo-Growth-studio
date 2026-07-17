import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

// Main admin portal issues { sub, roles: string[] }; Growth Studio issues { sub, role: string }.
interface JwtPayload {
  sub: string;
  role?: string;
  roles?: string[];
  tenantId?: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_ACCESS_SECRET'),
    });
  }

  async validate(payload: JwtPayload) {
    const rawRole = payload.role ?? (Array.isArray(payload.roles) ? payload.roles[0] : undefined);
    const role = typeof rawRole === 'string' ? rawRole.toLowerCase() : rawRole;
    return { userId: payload.sub, role, tenantId: payload.tenantId };
  }
}
