import { HttpException, HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-codes';

/**
 * Base class for failures that carry a domain code. GlobalExceptionFilter maps
 * them to the shared error response; the code itself stays in the logs.
 */
export class DomainException extends HttpException {
  public readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string, status: HttpStatus) {
    super({ code, message }, status);
    this.code = code;
  }
}

export class InsufficientFundsException extends DomainException {
  constructor(message = 'Wallet balance is too low for this operation.') {
    super(
      ErrorCode.INSUFFICIENT_FUNDS,
      message,
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class AmountTooLargeException extends DomainException {
  constructor() {
    super(
      ErrorCode.AMOUNT_TOO_LARGE,
      'The resulting balance would be too large for this wallet.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class DuplicateWalletException extends DomainException {
  constructor(
    message = 'A wallet already exists for this email or mobile number.',
  ) {
    super(ErrorCode.DUPLICATE_WALLET, message, HttpStatus.CONFLICT);
  }
}

export class MissingIdempotencyKeyException extends DomainException {
  constructor() {
    super(
      ErrorCode.MISSING_IDEMPOTENCY_KEY,
      'An Idempotency-Key header is required for this operation.',
      HttpStatus.BAD_REQUEST,
    );
  }
}

export class IdempotencyKeyReusedException extends DomainException {
  constructor() {
    super(
      ErrorCode.IDEMPOTENCY_KEY_REUSED,
      'This Idempotency-Key was already used with a different request body.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class SameWalletTransferException extends DomainException {
  constructor() {
    super(
      ErrorCode.SAME_WALLET_TRANSFER,
      'A transfer needs two different wallets. To move money between currencies inside one wallet, use a swap.',
      HttpStatus.UNPROCESSABLE_ENTITY,
    );
  }
}

export class WalletNotFoundException extends DomainException {
  constructor(walletId?: string) {
    super(
      ErrorCode.WALLET_NOT_FOUND,
      walletId
        ? `Wallet ${walletId} does not exist.`
        : 'Wallet does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}

export class TransactionNotFoundException extends DomainException {
  constructor(transactionId?: string) {
    super(
      ErrorCode.TRANSACTION_NOT_FOUND,
      transactionId
        ? `Transaction ${transactionId} does not exist.`
        : 'Transaction does not exist.',
      HttpStatus.NOT_FOUND,
    );
  }
}
