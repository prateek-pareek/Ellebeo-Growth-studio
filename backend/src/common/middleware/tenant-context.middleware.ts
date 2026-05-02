import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      try {
        // We decode without verifying here because JwtAuthGuard will verify it properly later in the request lifecycle.
        // This middleware is just to ensure tenantId is available early if needed.
        const decoded = jwt.decode(token) as any;
        if (decoded && decoded.tenantId) {
          (req as any).tenantId = decoded.tenantId;
        }
      } catch (e) {
        // Ignore, let JwtAuthGuard handle invalid tokens
      }
    }
    next();
  }
}
