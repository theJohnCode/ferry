import { Injectable, Logger } from '@nestjs/common';
import {
  Currency,
  Prisma,
  Transaction,
  TransactionType,
} from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService, RateQuote } from '../rates/rates.service';
import {
  fitsMoneyColumn,
  parseMoney,
  roundDown,
} from '../common/money/money.util';
import { hashRequestBody } from '../common/idempotency/request-hash.util';
import {
  AmountTooLargeException,
  IdempotencyKeyReusedException,
  InsufficientFundsException,
  MissingIdempotencyKeyException,
  SameWalletTransferException,
  TransactionNotFoundException,
  WalletNotFoundException,
} from '../common/errors/domain.exceptions';
import { ListTransactionsDto } from './dto/list-transactions.dto';
import { DepositDto } from './dto/deposit.dto';
import { SwapDto } from './dto/swap.dto';
import { TransferDto } from './dto/transfer.dto';
import { serializeTransaction } from './transaction.view';
import {
  PaginatedTransactionsResponseDto,
  TransactionResponseDto,
} from './dto/transaction-response.dto';

// Interactive transactions get more time than the default, since twenty
// parallel transfers in the e2e suite are normal for this project's load test.
const TRANSACTION_LOCK_OPTIONS = { maxWait: 5000, timeout: 10000 } as const;

type BalanceLockRows = {
  wallet_id: string;
  currency: Currency;
  amount: Prisma.Decimal;
};

interface TransferInput {
  fromWalletId: string;
  toWalletId: string;
  currency: Currency;
  amount: Prisma.Decimal;
  toCurrency: Currency;
}

@Injectable()
export class LedgerService {
  private readonly logger = new Logger(LedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ratesService: RatesService,
  ) {}

  public async deposit(
    walletId: string,
    dto: DepositDto,
    idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = hashRequestBody(dto);
    await this.assertWalletExists(walletId);
    const amount = parseMoney(dto.amount);

    const stored = await this.executeIdempotent(
      walletId,
      key,
      requestHash,
      () => this.runDeposit(walletId, dto.currency, amount, key, requestHash),
    );
    return serializeTransaction(stored);
  }

  public async swap(
    walletId: string,
    dto: SwapDto,
    idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = hashRequestBody(dto);
    await this.assertWalletExists(walletId);
    const amount = parseMoney(dto.amount);
    // Rates are fetched before the transaction opens so no row lock is held
    // while waiting on the FX provider.
    const quote = await this.ratesService.getRate(dto.from, dto.to);

    const stored = await this.executeIdempotent(
      walletId,
      key,
      requestHash,
      () =>
        this.runSwap(
          walletId,
          dto.from,
          dto.to,
          amount,
          quote,
          key,
          requestHash,
        ),
    );
    return serializeTransaction(stored);
  }

  public async transfer(
    initiatorWalletId: string,
    dto: TransferDto,
    idempotencyKey?: string,
  ): Promise<TransactionResponseDto> {
    const key = requireIdempotencyKey(idempotencyKey);
    const requestHash = hashRequestBody(dto);
    if (dto.fromWalletId === dto.toWalletId) {
      throw new SameWalletTransferException();
    }
    await this.assertWalletExists(dto.fromWalletId);
    await this.assertWalletExists(dto.toWalletId);

    const input: TransferInput = {
      fromWalletId: dto.fromWalletId,
      toWalletId: dto.toWalletId,
      currency: dto.currency,
      amount: parseMoney(dto.amount),
      toCurrency: dto.toCurrency ?? dto.currency,
    };
    const quote =
      input.currency === input.toCurrency
        ? null
        : await this.ratesService.getRate(input.currency, input.toCurrency);

    const stored = await this.executeIdempotent(
      dto.fromWalletId,
      key,
      requestHash,
      () => this.runTransfer(input, quote, key, requestHash),
    );
    return serializeTransaction(stored);
  }

  public async getTransaction(id: string): Promise<TransactionResponseDto> {
    const row = await this.prisma.transaction.findUnique({ where: { id } });
    if (!row) {
      throw new TransactionNotFoundException(id);
    }
    return serializeTransaction(row);
  }

  // A transfer is one row but appears in the history of both wallets.
  public async listTransactions(
    walletId: string,
    query: ListTransactionsDto,
  ): Promise<PaginatedTransactionsResponseDto> {
    await this.assertWalletExists(walletId);

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const where: Prisma.TransactionWhereInput = {
      AND: [
        {
          OR: [{ sourceWalletId: walletId }, { destinationWalletId: walletId }],
        },
        query.type ? { type: query.type } : undefined,
        query.currency
          ? {
              OR: [
                { sourceCurrency: query.currency },
                { destinationCurrency: query.currency },
              ],
            }
          : undefined,
      ].filter((entry) => entry !== undefined),
    };

    const [rows, total] = await this.prisma.$transaction([
      this.prisma.transaction.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.transaction.count({ where }),
    ]);

    return {
      items: rows.map((row) => ({
        ...serializeTransaction(row),
        direction: transferDirection(row, walletId),
      })),
      page,
      limit,
      total,
    };
  }

  private async runDeposit(
    walletId: string,
    currency: Currency,
    amount: Prisma.Decimal,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      await this.ensureBalanceRows(tx, [{ walletId, currency }]);
      const locked = await this.lockBalanceRows(tx, [{ walletId, currency }]);
      if (!fitsMoneyColumn(amountOf(walletId, currency, locked).plus(amount))) {
        throw new AmountTooLargeException();
      }

      await tx.balance.update({
        where: { walletId_currency: { walletId, currency } },
        data: { amount: { increment: amount } },
      });

      return tx.transaction.create({
        data: {
          type: TransactionType.deposit,
          destinationWalletId: walletId,
          destinationCurrency: currency,
          destinationAmount: roundDown(amount),
          initiatorWalletId: walletId,
          idempotencyKey,
          requestHash,
        },
      });
    }, TRANSACTION_LOCK_OPTIONS);
  }

  private async runSwap(
    walletId: string,
    from: Currency,
    to: Currency,
    amount: Prisma.Decimal,
    quote: RateQuote,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      const pairs = [
        { walletId, currency: from },
        { walletId, currency: to },
      ];
      await this.ensureBalanceRows(tx, pairs);
      const locked = await this.lockBalanceRows(tx, pairs);
      const available = amountOf(walletId, from, locked);
      if (available.lessThan(amount)) {
        throw new InsufficientFundsException(
          `Not enough ${from} to swap: balance is ${available.toFixed(8)}.`,
        );
      }
      const destinationAmount = roundDown(amount.times(quote.rate));
      const targetBalance = amountOf(walletId, to, locked);
      if (!fitsMoneyColumn(targetBalance.plus(destinationAmount))) {
        throw new AmountTooLargeException();
      }

      await tx.balance.update({
        where: { walletId_currency: { walletId, currency: from } },
        data: { amount: { decrement: amount } },
      });
      await tx.balance.update({
        where: { walletId_currency: { walletId, currency: to } },
        data: { amount: { increment: destinationAmount } },
      });

      return tx.transaction.create({
        data: {
          type: TransactionType.swap,
          sourceWalletId: walletId,
          destinationWalletId: walletId,
          sourceCurrency: from,
          sourceAmount: amount,
          destinationCurrency: to,
          destinationAmount,
          rate: quote.rate.toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN),
          rateSource: quote.source,
          rateFetchedAt: quote.fetchedAt,
          initiatorWalletId: walletId,
          idempotencyKey,
          requestHash,
        },
      });
    }, TRANSACTION_LOCK_OPTIONS);
  }

  private async runTransfer(
    input: TransferInput,
    quote: RateQuote | null,
    idempotencyKey: string,
    requestHash: string,
  ): Promise<Transaction> {
    return this.prisma.$transaction(async (tx) => {
      const pairs = [
        { walletId: input.fromWalletId, currency: input.currency },
        { walletId: input.toWalletId, currency: input.toCurrency },
      ];
      await this.ensureBalanceRows(tx, pairs);
      const locked = await this.lockBalanceRows(tx, pairs);
      const available = amountOf(input.fromWalletId, input.currency, locked);
      if (available.lessThan(input.amount)) {
        throw new InsufficientFundsException(
          `Not enough ${input.currency} to transfer: balance is ${available.toFixed(8)}.`,
        );
      }
      const destinationAmount = quote
        ? roundDown(input.amount.times(quote.rate))
        : input.amount;
      const targetBalance = amountOf(
        input.toWalletId,
        input.toCurrency,
        locked,
      );
      if (!fitsMoneyColumn(targetBalance.plus(destinationAmount))) {
        throw new AmountTooLargeException();
      }

      await tx.balance.update({
        where: {
          walletId_currency: {
            walletId: input.fromWalletId,
            currency: input.currency,
          },
        },
        data: { amount: { decrement: input.amount } },
      });
      await tx.balance.update({
        where: {
          walletId_currency: {
            walletId: input.toWalletId,
            currency: input.toCurrency,
          },
        },
        data: { amount: { increment: destinationAmount } },
      });

      return tx.transaction.create({
        data: {
          type: TransactionType.transfer,
          sourceWalletId: input.fromWalletId,
          destinationWalletId: input.toWalletId,
          sourceCurrency: input.currency,
          sourceAmount: input.amount,
          destinationCurrency: input.toCurrency,
          destinationAmount,
          rate:
            quote?.rate.toDecimalPlaces(12, Prisma.Decimal.ROUND_DOWN) ?? null,
          rateSource: quote?.source ?? null,
          rateFetchedAt: quote?.fetchedAt ?? null,
          initiatorWalletId: input.fromWalletId,
          idempotencyKey,
          requestHash,
        },
      });
    }, TRANSACTION_LOCK_OPTIONS);
  }

  private async assertWalletExists(walletId: string): Promise<void> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id: walletId },
      select: { id: true },
    });
    if (!wallet) {
      throw new WalletNotFoundException(walletId);
    }
  }

  private findByIdempotency(
    walletId: string,
    idempotencyKey: string,
  ): Promise<Transaction | null> {
    return this.prisma.transaction.findUnique({
      where: {
        initiatorWalletId_idempotencyKey: {
          initiatorWalletId: walletId,
          idempotencyKey,
        },
      },
    });
  }

  private assertSameRequestBody(
    stored: Transaction,
    requestHash: string,
  ): void {
    if (stored.requestHash !== requestHash) {
      throw new IdempotencyKeyReusedException();
    }
  }

  /**
   * Pre-checks for a stored result, then runs the money-moving transaction.
   * When the idempotency insert races and loses, PostgreSQL has already
   * aborted this transaction, so the lookup of the stored result happens
   * outside the failed one.
   */
  private async executeIdempotent(
    walletId: string,
    idempotencyKey: string,
    requestHash: string,
    run: () => Promise<Transaction>,
  ): Promise<Transaction> {
    const existing = await this.findByIdempotency(walletId, idempotencyKey);
    if (existing) {
      this.assertSameRequestBody(existing, requestHash);
      return existing;
    }

    try {
      return await run();
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const stored = await this.findByIdempotency(walletId, idempotencyKey);
        if (!stored) {
          throw error;
        }
        this.assertSameRequestBody(stored, requestHash);
        return stored;
      }
      throw error;
    }
  }

  private async ensureBalanceRows(
    tx: Prisma.TransactionClient,
    pairs: { walletId: string; currency: Currency }[],
  ): Promise<void> {
    // Missing rows are created before locking, so the first deposit in a new
    // currency cannot race a transfer touching the same row.
    await tx.$executeRaw(
      Prisma.sql`INSERT INTO "balance" ("wallet_id", "currency", "amount") VALUES ${Prisma.join(
        pairs.map(
          (pair) =>
            Prisma.sql`(${pair.walletId}::uuid, ${pair.currency}::"Currency", 0)`,
        ),
        ', ',
      )} ON CONFLICT DO NOTHING`,
    );
  }

  private async lockBalanceRows(
    tx: Prisma.TransactionClient,
    pairs: { walletId: string; currency: Currency }[],
  ): Promise<BalanceLockRows[]> {
    const visible = new Map<string, { walletId: string; currency: Currency }>();
    for (const pair of pairs) {
      visible.set(`${pair.walletId}:${pair.currency}`, pair);
    }
    return tx.$queryRaw<BalanceLockRows[]>(
      Prisma.sql`SELECT "wallet_id", "currency", "amount" FROM "balance" WHERE ${Prisma.join(
        [...visible.values()].map(
          (pair) =>
            Prisma.sql`("wallet_id" = ${pair.walletId}::uuid AND "currency" = ${pair.currency}::"Currency")`,
        ),
        ' OR ',
      )} ORDER BY "wallet_id" ASC, "currency" ASC FOR UPDATE`,
    );
  }
}

function amountOf(
  walletId: string,
  currency: Currency,
  rows: BalanceLockRows[],
): Prisma.Decimal {
  const row = rows.find(
    (entry) => entry.wallet_id === walletId && entry.currency === currency,
  );
  if (!row) {
    throw new Error(
      `Locked balance row for ${walletId}/${currency} is missing.`,
    );
  }
  return row.amount;
}

function transferDirection(
  row: Transaction,
  walletId: string,
): 'sent' | 'received' | 'self' {
  if (row.type === TransactionType.deposit) {
    return 'received';
  }
  if (row.type === TransactionType.swap) {
    return 'self';
  }
  return row.sourceWalletId === walletId ? 'sent' : 'received';
}

function requireIdempotencyKey(idempotencyKey?: string): string {
  const key = idempotencyKey?.trim();
  if (!key) {
    throw new MissingIdempotencyKeyException();
  }
  return key;
}
