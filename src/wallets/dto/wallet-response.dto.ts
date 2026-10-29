import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Balance, Currency, Prisma, Wallet } from '../../generated/client';
import { serializeMoney } from '../../common/money/money.util';

export class WalletBalanceDto {
  @ApiProperty({ enum: Currency })
  public currency!: Currency;

  @ApiProperty({ example: '0.00000000' })
  public amount!: string;
}

export class WalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'ada@example.com',
  })
  public email!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+2348031234567',
  })
  public mobile!: string | null;

  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' })
  public createdAt!: string;

  @ApiProperty({ type: [WalletBalanceDto] })
  public balances!: WalletBalanceDto[];

  @ApiProperty({ example: '106.25000000' })
  public totalUsd!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '2026-10-29T10:18:00.000Z',
  })
  public ratesFetchedAt!: string | null;
}

export class CreateWalletResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: 'ada@example.com',
  })
  public email!: string | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '+2348031234567',
  })
  public mobile!: string | null;

  @ApiProperty({ example: '2026-10-29T10:15:00.000Z' })
  public createdAt!: string;
}

export function serializeWallet(
  wallet: Wallet,
  balances: Balance[],
  usdTotal: Prisma.Decimal,
  ratesFetchedAt: Date | null,
): WalletResponseDto {
  return {
    id: wallet.id,
    email: wallet.email,
    mobile: wallet.mobile,
    createdAt: wallet.createdAt.toISOString(),
    balances: balances
      .slice()
      .sort((a, b) => a.currency.localeCompare(b.currency))
      .map((balance) => ({
        currency: balance.currency,
        amount: serializeMoney(balance.amount),
      })),
    totalUsd: usdTotal.toFixed(8),
    ratesFetchedAt: ratesFetchedAt ? ratesFetchedAt.toISOString() : null,
  };
}
