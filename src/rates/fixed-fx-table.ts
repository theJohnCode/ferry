import { Prisma } from '../generated/client';
import { FIATS, Fiat } from './currencies';

/**
 * Fallback rates used when the provider fails and nothing has been stored.
 * Values are fiat per USD and drift from the market.
 */
export const FIXED_USD_TO_FIAT: Record<Fiat, string> = {
  USD: '1',
  NGN: '1600',
  GHS: '16',
  XAF: '600',
  EUR: '0.92',
};

export function fixedUsdRates(): Record<Fiat, Prisma.Decimal> {
  return Object.fromEntries(
    FIATS.map((fiat) => [fiat, new Prisma.Decimal(FIXED_USD_TO_FIAT[fiat])]),
  ) as Record<Fiat, Prisma.Decimal>;
}
