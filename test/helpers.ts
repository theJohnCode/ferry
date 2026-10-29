import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { GlobalExceptionFilter } from '../src/common/filters/global-exception.filter';
import { PrismaService } from '../src/prisma/prisma.service';
import { FxProvider } from '../src/rates/fx-provider';
import { Prisma } from '../src/generated/client';
import { FIATS, Fiat } from '../src/rates/currencies';

// Rates every "live" provider response answers with in these tests, so
// conversions are deterministic: e.g. 1600 cNGN -> 1 USDx.
export const TEST_USD_RATES: Record<Fiat, string> = {
  USD: '1',
  NGN: '1600',
  GHS: '16',
  XAF: '600',
  EUR: '0.92',
};

export function fixedUsdRatesForTests(): Record<Fiat, Prisma.Decimal> {
  return Object.fromEntries(
    FIATS.map((fiat) => [fiat, new Prisma.Decimal(TEST_USD_RATES[fiat])]),
  ) as Record<Fiat, Prisma.Decimal>;
}

export class FixedFxProvider {
  public fetchUsdRates() {
    return Promise.resolve({
      usdRates: fixedUsdRatesForTests(),
      fetchedAt: new Date(),
    });
  }
}

// One successful fetch, then the provider is down: proves the stale path.
export class FlakyFxProvider {
  private calls = 0;

  public fetchUsdRates() {
    this.calls += 1;
    if (this.calls === 1) {
      return new FixedFxProvider().fetchUsdRates();
    }
    throw new Error('FX provider is down.');
  }
}

// Always down, and the database has no stored rates: proves the fixed table.
export class FailingFxProvider {
  public fetchUsdRates(): Promise<never> {
    throw new Error('FX provider is down.');
  }
}

export interface AppOptions {
  fxProvider?: new () => unknown;
}

export async function createApp(
  options: AppOptions = {},
): Promise<INestApplication> {
  const moduleBuilder = Test.createTestingModule({ imports: [AppModule] });
  if (options.fxProvider) {
    const factory = options.fxProvider;
    moduleBuilder.overrideProvider(FxProvider).useFactory({
      factory: () => new factory(),
      inject: [],
    });
  }
  const moduleRef = await moduleBuilder.compile();
  const app = moduleRef.createNestApplication();

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());

  await app.init();
  return app;
}

export async function resetDatabase(app: INestApplication): Promise<void> {
  const prisma = app.get(PrismaService);
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "balance", "transaction", "wallet", "fx_rate" RESTART IDENTITY CASCADE',
  );
}

export async function closeApp(app: INestApplication): Promise<void> {
  await app.close();
}

interface Wallet {
  id: string;
  email: string | null;
  mobile: string | null;
  createdAt: string;
}

export async function createWallet(
  app: INestApplication,
  contact: { email?: string; mobile?: string } = {},
): Promise<Wallet> {
  const response = await request(app.getHttpServer())
    .post('/wallets')
    .send(contact)
    .expect(201);
  return response.body as Wallet;
}

export async function deposit(
  app: INestApplication,
  walletId: string,
  currency: string,
  amount: string,
): Promise<void> {
  await request(app.getHttpServer())
    .post(`/wallets/${walletId}/deposits`)
    .set('Idempotency-Key', randomUUID())
    .send({ currency, amount })
    .expect(201);
}

export type Balance = { currency: string; amount: string };

export function balanceOf(balances: Balance[], currency: string): string {
  const found = balances.find((entry) => entry.currency === currency);
  return found?.amount ?? '0.00000000';
}
