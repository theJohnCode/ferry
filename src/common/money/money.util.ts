import { Prisma } from '../../generated/client';

// DECIMAL(30, 8) values can carry 30 significant digits, and conversion
// products a few more. decimal.js defaults to 20 significant digits, which
// would silently round the value before the explicit 8-decimal rounding.
Prisma.Decimal.set({ precision: 40 });

// Money is never a JavaScript number. Amounts arrive as strings, are parsed
// into exact decimals, stored as DECIMAL(30, 8) and serialised with a fixed
// scale so the output format is deliberate rather than incidental.
export const MONEY_SCALE = 8;

// DECIMAL(30, 8) holds at most 22 integer digits. Values at or above 10^22
// would fail at the database and surface as a 500, so they are rejected at
// the edge instead.
export const MAX_MONEY = new Prisma.Decimal('1e22');

const MONEY_STRING_PATTERN = /^\d+(\.\d{1,8})?$/;

export class InvalidMoneyError extends Error {
  constructor(value: unknown) {
    super(
      `"${String(value)}" is not a valid decimal amount. Amounts must be strings with at most ${MONEY_SCALE} decimal places and fewer than 22 integer digits.`,
    );
    this.name = 'InvalidMoneyError';
  }
}

export function isMoneyString(value: unknown): boolean {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    !MONEY_STRING_PATTERN.test(value)
  ) {
    return false;
  }
  const decimal = new Prisma.Decimal(value);
  return !decimal.isZero() && decimal.lessThan(MAX_MONEY);
}

export function fitsMoneyColumn(value: Prisma.Decimal): boolean {
  return value.abs().lessThan(MAX_MONEY);
}

export function parseMoney(value: string): Prisma.Decimal {
  if (!isMoneyString(value)) {
    throw new InvalidMoneyError(value);
  }
  return new Prisma.Decimal(value);
}

// Rounding rule: converted amounts round down to MONEY_SCALE. The platform
// can therefore never create value for itself through rounding.
export function roundDown(value: Prisma.Decimal): Prisma.Decimal {
  return value.toDecimalPlaces(MONEY_SCALE, Prisma.Decimal.ROUND_DOWN);
}

export function serializeMoney(value: Prisma.Decimal): string {
  return value.toFixed(MONEY_SCALE);
}
