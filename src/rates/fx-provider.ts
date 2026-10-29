import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/client';
import { EnvironmentService } from '../config/environment';
import { FIATS, Fiat } from './currencies';

export class FxProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FxProviderError';
  }
}

export interface FxRateFetch {
  readonly usdRates: Record<Fiat, Prisma.Decimal>;
  readonly fetchedAt: Date;
}

/**
 * Fetches USD-based rates; every coin pair is a cross rate through USD.
 * Injectable so tests can replace it with a stub.
 */
@Injectable()
export class FxProvider {
  private readonly logger = new Logger(FxProvider.name);
  private readonly providerUrl: string;
  private readonly timeoutMs: number;

  constructor() {
    this.providerUrl = EnvironmentService.getValue('FX_PROVIDER_URL') as string;
    this.timeoutMs = EnvironmentService.getValue('FX_TIMEOUT_MS') as number;
  }

  public async fetchUsdRates(): Promise<FxRateFetch> {
    let payload: unknown;
    try {
      const response = await fetch(this.providerUrl, {
        signal: AbortSignal.timeout(this.timeoutMs),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) {
        throw new FxProviderError(`FX provider responded ${response.status}.`);
      }
      payload = await response.json();
    } catch (error) {
      if (error instanceof FxProviderError) {
        throw error;
      }
      const detail =
        error instanceof Error
          ? `${error.name}: ${error.message}`
          : String(error);
      throw new FxProviderError(`FX provider request failed. ${detail}`);
    }

    const rates = (payload as { rates?: Record<string, unknown> })?.rates;
    if (!rates || typeof rates !== 'object') {
      throw new FxProviderError(
        'FX provider response is missing a rates object.',
      );
    }

    const usdRates = {} as Record<Fiat, Prisma.Decimal>;
    for (const fiat of FIATS) {
      const raw = rates[fiat];
      if (typeof raw !== 'number' || !Number.isFinite(raw) || raw <= 0) {
        throw new FxProviderError(
          `FX provider response has no usable rate for ${fiat}.`,
        );
      }
      this.logger.debug(`Fetched live rate USD -> ${fiat}: ${raw}`);
      usdRates[fiat] = new Prisma.Decimal(String(raw));
    }

    return { usdRates, fetchedAt: new Date() };
  }
}
