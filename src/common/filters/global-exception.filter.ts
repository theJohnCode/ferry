import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ErrorCode } from '../errors/error-codes';
import { Request, Response } from 'express';

type ExceptionBody = {
  code?: string;
  message?: string | string[];
};

// Every error leaves the API in one shape, and unknown failures collapse into
// a 500 instead of leaking stack traces. Domain exceptions are the only way to
// attach a machine-readable code.
const STATUS_TO_CODE: Record<number, ErrorCode> = {
  [HttpStatus.BAD_REQUEST]: ErrorCode.VALIDATION_ERROR,
  [HttpStatus.NOT_FOUND]: ErrorCode.NOT_FOUND,
  [HttpStatus.METHOD_NOT_ALLOWED]: ErrorCode.METHOD_NOT_ALLOWED,
  [HttpStatus.CONFLICT]: ErrorCode.CONFLICT,
  [HttpStatus.UNPROCESSABLE_ENTITY]: ErrorCode.UNPROCESSABLE,
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = String(
      (request as { requestId?: string })?.requestId ?? '',
    ).trim();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    let message = 'Internal server error';
    let errors: string[] | null = null;

    if (exception instanceof HttpException) {
      const body = exception.getResponse();
      if (typeof body === 'string') {
        message = body;
      } else if (typeof body === 'object' && body !== null) {
        const parsed = body as ExceptionBody;
        const rawMessage = parsed.message;
        if (Array.isArray(rawMessage)) {
          errors = rawMessage;
          message = String(rawMessage[0]);
        } else if (typeof rawMessage === 'string' && rawMessage !== '') {
          message = rawMessage;
        } else {
          message = exception.message;
        }
      } else {
        message = exception.message;
      }
    }

    const code =
      exception instanceof HttpException &&
      typeof (exception.getResponse() as ExceptionBody)?.code === 'string'
        ? ((exception.getResponse() as ExceptionBody).code as string)
        : (STATUS_TO_CODE[status] ?? ErrorCode.INTERNAL_SERVER_ERROR);

    // Log the real error for 500s so the server console is never hiding a bug.
    if (status >= 500) {
      const detail =
        exception instanceof Error
          ? exception.stack
          : typeof exception === 'string'
            ? exception
            : (JSON.stringify(exception) ?? 'Unknown error');
      this.logger.error(
        `${request.method} ${request.url} -> ${status} [${code}]: ${detail}`,
      );
    } else {
      this.logger.warn(
        `${request.method} ${request.url} -> ${status} [${code}]: ${message}`,
      );
    }

    response.status(status).json({
      success: false,
      message,
      errors,
      timestamp: new Date().toISOString(),
      path: request.url,
      requestId: requestId || undefined,
    });
  }
}
