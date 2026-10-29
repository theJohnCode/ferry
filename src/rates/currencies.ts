import { Currency } from '../generated/client';

export const FIATS = ['NGN', 'GHS', 'XAF', 'USD', 'EUR'] as const;
export type Fiat = (typeof FIATS)[number];

export const COIN_FIATS: Record<Currency, Fiat> = {
  [Currency.cNGN]: 'NGN',
  [Currency.cGHS]: 'GHS',
  [Currency.cXAF]: 'XAF',
  [Currency.USDx]: 'USD',
  [Currency.EURx]: 'EUR',
};

export const CURRENCIES = Object.values(Currency) as Currency[];
