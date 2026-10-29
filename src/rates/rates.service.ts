import { Injectable, Logger } from '@nestjs/common';
import { Currency, Prisma } from '../generated/client';
import { EnvironmentService } from '../config/environment';
import { PrismaService } from '../prisma/prisma.service';
import { FxProvider } from './fx-provider';
import { fixedUsdRates } from './fixed-fx-table';
import { CURRENCIES, COIN_FIATS, FIATS, Fiat } from './currencies';

export interface RateSet {
  readonly source: 'live' | 'stale' | 'fallback';
  readonly fetchedAt: Date | null;
  readonly usdRates: Record<Fiat, Prisma.Decimal>;
}

export interface RateQuote {
  readonly rate: Prisma.Decimal;
  readonly source: RateSet['source'];
  readonly fetchedAt: Date | null;
}

export interface RatesOverview {
  readonly source: RateSet['source'];
  readonly fetchedAt: string | null;
  readonly rates: Record<Currency, Record<Currency, string>>;
}

@Injectable()
export class RatesService {
  private readonly logger = new Logger(RatesService.name);
  private readonly cacheMs: number;
  private cache: { set: RateSet; loadedAt: number } | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly provider: FxProvider,
  ) {
    this.cacheMs =
      (EnvironmentService.getValue('FX_CACHE_SECONDS') as number) * 1000;
  }

  /**
   * Newest usable rate set. Order of preference:
   *   1. live provider data (upserted into FxRate),
   *   2. the last rates stored in the database ("stale"),
   *   3. the fixed table shipped in code ("fallback").
   * A provider failure never surfaces as a 500.
   */
  public async getRateSet(): Promise<RateSet> {
    if (this.cache && Date.now() - this.cache.loadedAt < this.cacheMs) {
      return this.cache.set;
    }

    let set: RateSet;
    try {
      const fetched = await this.provider.fetchUsdRates();
      set = {
        source: 'live',
        fetchedAt: fetched.fetchedAt,
        usdRates: fetched.usdRates,
      };
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      this.logger.warn(`FX provider unavailable, falling back. ${detail}`);
      set = (await this.loadStoredRateSet()) ?? this.loadFixedRateSet();
    }

    this.cache = { set, loadedAt: Date.now() };
    if (set.source === 'live') {
      await this.persistRateSet(set);
    }
    return set;
  }

  /**
   * Converts through USD, so every pair works without storing each combination.
   */
  public crossRate(
    base: Currency,
    quote: Currency,
    set: RateSet,
  ): Prisma.Decimal {
    if (base === quote) {
      return new Prisma.Decimal(1);
    }
    const quotePerUsd = set.usdRates[COIN_FIATS[quote]];
    const basePerUsd = set.usdRates[COIN_FIATS[base]];
    return quotePerUsd.div(basePerUsd);
  }

  public async getRate(base: Currency, quote: Currency): Promise<RateQuote> {
    const set = await this.getRateSet();
    return {
      rate: this.crossRate(base, quote, set),
      source: set.source,
      fetchedAt: set.fetchedAt,
    };
  }

  public async getRatesOverview(): Promise<RatesOverview> {
    const set = await this.getRateSet();
    const rates = {} as Record<Currency, Record<Currency, string>>;
    for (const base of CURRENCIES) {
      const row: Record<Currency, string> = {} as Record<Currency, string>;
      for (const quote of CURRENCIES) {
        // Same 12-decimal precision the rates are stored with, so a stored
        // rate and a served rate are always the same number.
        row[quote] = this.crossRate(base, quote, set)
          .toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN)
          .toString();
      }
      rates[base] = row;
    }
    return {
      source: set.source,
      fetchedAt: set.fetchedAt?.toISOString() ?? null,
      rates,
    };
  }

  private async loadStoredRateSet(): Promise<RateSet | null> {
    const rows = await this.prisma.fxRate.findMany();
    if (rows.length === 0) {
      return null;
    }

    // Only the four stored rates against USDx are needed; the rest is math.
    const usdRates: Partial<Record<Fiat, Prisma.Decimal>> = {
      USD: new Prisma.Decimal(1),
    };
    let newestFetchedAt: Date | null = null;
    for (const row of rows) {
      if (newestFetchedAt === null || row.fetchedAt > newestFetchedAt) {
        newestFetchedAt = row.fetchedAt;
      }
      if (row.base !== Currency.USDx) {
        continue;
      }
      usdRates[COIN_FIATS[row.quote]] = row.rate;
    }

    const missing = FIATS.filter((fiat) => usdRates[fiat] === undefined);
    if (missing.length > 0) {
      this.logger.warn(
        `Stored rates are incomplete (missing ${missing.join(', ')}).`,
      );
      return null;
    }

    return {
      source: 'stale',
      fetchedAt: newestFetchedAt,
      usdRates: usdRates as Record<Fiat, Prisma.Decimal>,
    };
  }

  private loadFixedRateSet(): RateSet {
    return { source: 'fallback', fetchedAt: null, usdRates: fixedUsdRates() };
  }

  private async persistRateSet(set: RateSet): Promise<void> {
    const operations: Prisma.PrismaPromise<unknown>[] = [];
    for (const base of CURRENCIES) {
      for (const quote of CURRENCIES) {
        if (base === quote) {
          continue;
        }
        const cross = this.crossRate(base, quote, set).toDecimalPlaces(
          12,
          Prisma.Decimal.ROUND_DOWN,
        );
        operations.push(
          this.prisma.fxRate.upsert({
            where: { base_quote: { base, quote } },
            create: {
              base,
              quote,
              rate: cross,
              source: set.source,
              fetchedAt: set.fetchedAt as Date,
            },
            update: {
              rate: cross,
              source: set.source,
              fetchedAt: set.fetchedAt as Date,
            },
          }),
        );
      }
    }
    await this.prisma.$transaction(operations);
  }
}
