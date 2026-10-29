import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { NextFunction, Request, Response } from 'express';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const incoming = String(
      (req as Request & { 'x-request-id'?: string }).headers['x-request-id'] ??
        (req as Request & { 'x-correlation-id'?: string }).headers[
          'x-correlation-id'
        ] ??
        '',
    ).trim();
    const requestId = incoming || randomUUID();
    (req as Request & { requestId?: string }).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
