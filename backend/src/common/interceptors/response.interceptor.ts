import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface Response<T> {
  success: boolean;
  data: T | null;
  meta: {
    timestamp: string;
    requestId: string;
  };
}

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, Response<T>> {
  private sanitize(value: unknown): unknown {
    if (Array.isArray(value)) {
      return value.map((v) => this.sanitize(v));
    }
    if (value && typeof value === 'object') {
      const entries = Object.entries(value as Record<string, unknown>)
        .filter(([key]) =>
          key !== 'password_hash'
          && key !== 'passwordHash'
          && key !== 'deleted_at'
          && key !== 'deletedAt'
          && key !== 'firebase_storage_path'
          && key !== 'firebaseStoragePath'
          && !key.startsWith('internal_'),
        )
        .map(([key, val]) => [key, this.sanitize(val)]);
      return Object.fromEntries(entries);
    }
    return value;
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    const ctx = context.switchToHttp();
    const request = ctx.getRequest();
    const requestId = (request.headers['x-request-id'] || request.id || 'unknown') as string;

    return next.handle().pipe(
      map((data) => ({
        success: true,
        data: (this.sanitize(data) as T) || null,
        meta: {
          timestamp: new Date().toISOString(),
          requestId,
        },
      })),
    );
  }
}
