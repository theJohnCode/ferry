import { applyDecorators, HttpStatus } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';
import { ErrorResponseDto } from './error-response.dto';

export function ApiBadRequestError(
  description = 'Invalid input or missing Idempotency-Key.',
) {
  return ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    type: ErrorResponseDto,
    description,
  });
}

export function ApiNotFoundError(
  description = 'Wallet or transaction not found.',
) {
  return ApiResponse({
    status: HttpStatus.NOT_FOUND,
    type: ErrorResponseDto,
    description,
  });
}

export function ApiConflictError(
  description = 'A wallet already exists for that email or mobile number.',
) {
  return ApiResponse({
    status: HttpStatus.CONFLICT,
    type: ErrorResponseDto,
    description,
  });
}

export function ApiUnprocessableError(
  description = 'Insufficient funds, idempotency key reused with a different body, or a result too large for this wallet.',
) {
  return ApiResponse({
    status: HttpStatus.UNPROCESSABLE_ENTITY,
    type: ErrorResponseDto,
    description,
  });
}

export function ApiServiceUnavailableError(
  description = 'The database is unreachable.',
) {
  return ApiResponse({
    status: HttpStatus.SERVICE_UNAVAILABLE,
    type: ErrorResponseDto,
    description,
  });
}

export function ApiWalletReadErrors() {
  return applyDecorators(ApiBadRequestError(), ApiNotFoundError());
}

export function ApiCreateWalletErrors() {
  return applyDecorators(ApiBadRequestError(), ApiConflictError());
}

export function ApiLedgerErrors() {
  return applyDecorators(
    ApiBadRequestError(),
    ApiNotFoundError(),
    ApiUnprocessableError(),
  );
}
