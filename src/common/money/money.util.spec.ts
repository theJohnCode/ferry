import { Prisma } from '../../generated/client';
import {
  fitsMoneyColumn,
  InvalidMoneyError,
  isMoneyString,
  parseMoney,
  roundDown,
  serializeMoney,
} from './money.util';

describe('money util', () => {
  describe('isMoneyString', () => {
    it.each([
      '0.1',
      '1500.50',
      '16',
      '100000',
      '0.00000001',
      '999999999999.99999999',
      '9999999999999999999999.99999999',
    ])('accepts %s', (value) => {
      expect(isMoneyString(value)).toBe(true);
    });

    it.each([
      1,
      null,
      undefined,
      'banana',
      '-5',
      '1e3',
      '1.234567891',
      '12.',
      '.5',
      '1 000',
      '',
      '0',
      '0.00',
      '10000000000000000000000',
      '99999999999999999999999',
    ])('rejects %p', (value) => {
      expect(isMoneyString(value)).toBe(false);
    });
  });

  describe('parseMoney', () => {
    it('parses an exact decimal', () => {
      expect(parseMoney('1500.50').toString()).toBe('1500.5');
    });

    it('keeps the full precision of a decimal string', () => {
      expect(parseMoney('0.12345678').toString()).toBe('0.12345678');
    });

    it('throws on a bad string with a clear message', () => {
      expect(() => parseMoney('banana')).toThrow(InvalidMoneyError);
      expect(() => parseMoney('1.234567891')).toThrow(
        /at most 8 decimal places/,
      );
    });
  });

  describe('fitsMoneyColumn', () => {
    it('accepts the largest value DECIMAL(30, 8) can hold', () => {
      expect(
        fitsMoneyColumn(new Prisma.Decimal('9999999999999999999999.99999999')),
      ).toBe(true);
    });

    it('rejects a value that would overflow the column', () => {
      expect(fitsMoneyColumn(new Prisma.Decimal('1e22'))).toBe(false);
      expect(fitsMoneyColumn(new Prisma.Decimal('1.6e25'))).toBe(false);
    });

    it('keeps full precision when adding near the column limit', () => {
      const nearMax = new Prisma.Decimal('9999999999999999999999.99999999');
      expect(fitsMoneyColumn(new Prisma.Decimal('0').plus(nearMax))).toBe(true);
    });
  });

  describe('roundDown', () => {
    it('rounds a repeating quotient down to 8 places', () => {
      const value = parseMoney('10').div(parseMoney('3'));
      expect(roundDown(value).toString()).toBe('3.33333333');
    });

    it('never rounds up, so shifting cannot create value', () => {
      const value = new Prisma.Decimal('0.000000009');
      expect(roundDown(value).toString()).toBe('0');
    });

    it('leaves exact values untouched', () => {
      expect(roundDown(new Prisma.Decimal('1234.00000001')).toString()).toBe(
        '1234.00000001',
      );
    });
  });

  describe('serializeMoney', () => {
    it('always produces a fixed 8-decimal string', () => {
      expect(serializeMoney(new Prisma.Decimal('0.1'))).toBe('0.10000000');
      expect(serializeMoney(new Prisma.Decimal('16'))).toBe('16.00000000');
      expect(
        serializeMoney(roundDown(parseMoney('10').div(parseMoney('3')))),
      ).toBe('3.33333333');
    });
  });
});
