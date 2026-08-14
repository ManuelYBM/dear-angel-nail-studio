import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';

interface ErrorPayload {
  code?: string;
  message?: string | string[];
}

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const raw = exception instanceof HttpException ? exception.getResponse() : null;
    const payload = typeof raw === 'object' && raw !== null ? (raw as ErrorPayload) : {};
    const fallback =
      status === 500
        ? 'Ocurrió un error inesperado.'
        : typeof raw === 'string'
          ? raw
          : 'Solicitud inválida.';

    response.status(status).json({
      statusCode: status,
      code: payload.code ?? this.defaultCode(status),
      message: payload.message ?? fallback,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
    });
  }

  private defaultCode(status: number): string {
    return HttpStatus[status] ?? 'ERROR';
  }
}
