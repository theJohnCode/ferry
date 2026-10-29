import { Prisma } from '../generated/client';
import { FIATS, Fiat } from './currencies';

// Last resort when the provider has failed and the database has never seen a
// successful fetch. Rates are the fiat value of one USD; they drift from the
// market, which the README lists as a known limitation.
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
