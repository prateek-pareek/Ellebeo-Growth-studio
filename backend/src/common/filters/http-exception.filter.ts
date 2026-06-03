import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request.headers['x-request-id'] as string) || (request as any).id || 'unknown';

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let errorResponse: any = {
      code: 'INTERNAL_ERROR',
      message: 'An unexpected error occurred',
    };

    if (exception instanceof HttpException) {
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        // Handle class-validator errors
        if ((res as any).message && Array.isArray((res as any).message)) {
          errorResponse = {
            code: 'VALIDATION_ERROR',
            message: 'Validation failed',
            details: (res as any).message,
          };
        } else {
          errorResponse = {
            code: (res as any).error || 'API_ERROR',
            message: (res as any).message || exception.message,
            details: (res as any).details,
          };
        }
      } else {
        errorResponse.message = res;
      }
    } else if (exception instanceof Error) {
      errorResponse.message = exception.message;
      // In production, you might not want to send the stack trace
      if (process.env.NODE_ENV !== 'production') {
        errorResponse.details = exception.stack;
      }
    }

    if (response.headersSent) return;

    response.status(status).json({
      success: false,
      error: errorResponse,
      meta: {
        timestamp: new Date().toISOString(),
        requestId,
      },
    });
  }
}
