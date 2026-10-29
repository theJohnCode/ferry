import { serializeMoney } from '../common/money/money.util';
import { Transaction, Prisma } from '../generated/client';
import { TransactionResponseDto } from './dto/transaction-response.dto';

export function serializeTransaction(row: Transaction): TransactionResponseDto {
  return {
    id: row.id,
    type: row.type,
    sourceWalletId: row.sourceWalletId,
    destinationWalletId: row.destinationWalletId,
    sourceCurrency: row.sourceCurrency,
    sourceAmount:
      row.sourceAmount === null ? null : serializeMoney(row.sourceAmount),
    destinationCurrency: row.destinationCurrency,
    destinationAmount: serializeMoney(row.destinationAmount),
    rate: row.rate
      ? row.rate.toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN).toString()
      : null,
    rateSource: row.rateSource,
    rateFetchedAt: row.rateFetchedAt ? row.rateFetchedAt.toISOString() : null,
    initiatorWalletId: row.initiatorWalletId,
    createdAt: row.createdAt.toISOString(),
  };
}
