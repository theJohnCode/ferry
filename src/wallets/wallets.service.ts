import { HttpStatus, Injectable } from '@nestjs/common';
import { Currency, Prisma } from '../generated/client';
import { PrismaService } from '../prisma/prisma.service';
import { RatesService } from '../rates/rates.service';
import { roundDown } from '../common/money/money.util';
import { ErrorCode } from '../common/errors/error-codes';
import {
  DomainException,
  WalletNotFoundException,
} from '../common/errors/domain.exceptions';
import { CURRENCIES } from '../rates/currencies';
import { CreateWalletDto } from './dto/create-wallet.dto';
import {
  CreateWalletResponseDto,
  serializeWallet,
  WalletResponseDto,
} from './dto/wallet-response.dto';

// Driver adapters keep the unique index name in a nested meta object; the
// Prisma 6 style `meta.target` array no longer exists.
function uniqueConstraintName(
  error: Prisma.PrismaClientKnownRequestError,
): string {
  const meta = error.meta as
    | { driverAdapterError?: { cause?: { constraint?: { index?: string } } } }
    | undefined;
  return meta?.driverAdapterError?.cause?.constraint?.index ?? '';
}

function describeUniqueWalletField(
  error: Prisma.PrismaClientKnownRequestError,
): string {
  const constraint = uniqueConstraintName(error);
  if (constraint.includes('email')) {
    return 'email address';
  }
  if (constraint.includes('mobile')) {
    return 'mobile number';
  }
  return 'contact details';
}

@Injectable()
export class WalletsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratesService: RatesService,
  ) {}

  public async createWallet(
    dto: CreateWalletDto,
  ): Promise<CreateWalletResponseDto> {
    const hasEmail = typeof dto.email === 'string' && dto.email.trim() !== '';
    const hasMobile =
      typeof dto.mobile === 'string' && dto.mobile.trim() !== '';
    if (!hasEmail && !hasMobile) {
      // PostgreSQL's wallet_has_contact check constraint would reject the
      // insert anyway, but a 400 is a far better answer to the client.
      throw new DomainException(
        ErrorCode.VALIDATION_ERROR,
        'A wallet needs an email or a mobile number.',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const wallet = await this.prisma.$transaction(async (tx) => {
        const created = await tx.wallet.create({
          data: { email: dto.email ?? null, mobile: dto.mobile ?? null },
        });
        // Every wallet starts with all five balance rows at zero, so readers
        // and the locking queries always see the full set.
        await tx.balance.createMany({
          data: CURRENCIES.map((currency: Currency) => ({
            walletId: created.id,
            currency,
            amount: new Prisma.Decimal(0),
          })),
        });
        return created;
      });
      return {
        id: wallet.id,
        email: wallet.email,
        mobile: wallet.mobile,
        createdAt: wallet.createdAt.toISOString(),
      };
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        const field = describeUniqueWalletField(error);
        throw new DuplicateWallet(field);
      }
      throw error;
    }
  }

  public async getWallet(id: string): Promise<WalletResponseDto> {
    const wallet = await this.prisma.wallet.findUnique({
      where: { id },
      include: { balances: true },
    });
    if (!wallet) {
      throw new WalletNotFoundException(id);
    }

    const rateSet = await this.ratesService.getRateSet();
    let totalUsd = new Prisma.Decimal(0);
    for (const balance of wallet.balances) {
      if (balance.currency === Currency.USDx || balance.amount.isZero()) {
        // One USDx is one dollar by construction, and empty rows add nothing.
        totalUsd = totalUsd.plus(balance.amount);
        continue;
      }
      const usd = this.ratesService.crossRate(
        balance.currency,
        Currency.USDx,
        rateSet,
      );
      totalUsd = totalUsd.plus(roundDown(balance.amount.times(usd)));
    }

    return serializeWallet(
      wallet,
      wallet.balances,
      roundDown(totalUsd),
      rateSet.fetchedAt,
    );
  }
}

class DuplicateWallet extends DomainException {
  constructor(field: string) {
    super(
      ErrorCode.DUPLICATE_WALLET,
      `A wallet already exists for this ${field}.`,
      HttpStatus.CONFLICT,
    );
  }
}
