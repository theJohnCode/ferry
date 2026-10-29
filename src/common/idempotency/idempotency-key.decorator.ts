import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/**
 * Reads the Idempotency-Key header for any operation that moves money.
 * Presence is validated in the ledger service so controllers stay thin.
 */
export const IdempotencyKey = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined => {
    const request = ctx
      .switchToHttp()
      .getRequest<{ headers: Record<string, string | string[] | undefined> }>();
    const value = request.headers['idempotency-key'];
    return Array.isArray(value) ? value[0] : value;
  },
);
