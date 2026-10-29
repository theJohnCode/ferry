import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency, RateSource, TransactionType } from '../../generated/client';

export class TransactionResponseDto {
  @ApiProperty({ format: 'uuid' })
  public id!: string;

  @ApiProperty({ enum: TransactionType })
  public type!: TransactionType;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public sourceWalletId!: string | null;

  @ApiPropertyOptional({ type: String, format: 'uuid', nullable: true })
  public destinationWalletId!: string | null;

  @ApiPropertyOptional({ enum: Currency, nullable: true })
  public sourceCurrency!: Currency | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    example: '160000.00000000',
  })
  public sourceAmount!: string | null;

  @ApiProperty({ enum: Currency })
  public destinationCurrency!: Currency;

  @ApiProperty({ example: '100.00000000' })
  public destinationAmount!: string;

  @ApiPropertyOptional({ type: String, nullable: true, example: '0.000625' })
  public rate!: string | null;

  @ApiPropertyOptional({ enum: RateSource, nullable: true })
  public rateSource!: RateSource | null;

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'When the applied rate was fetched from its source.',
    example: '2026-10-29T10:17:00.000Z',
  })
  public rateFetchedAt!: string | null;

  @ApiProperty({ format: 'uuid' })
  public initiatorWalletId!: string;

  @ApiPropertyOptional({ enum: ['sent', 'received', 'self'] })
  public direction?: 'sent' | 'received' | 'self';

  @ApiProperty({ example: '2026-10-29T10:16:00.000Z' })
  public createdAt!: string;
}

export class PaginatedTransactionsResponseDto {
  @ApiProperty({ type: [TransactionResponseDto] })
  public items!: TransactionResponseDto[];

  @ApiProperty({ example: 1 })
  public page!: number;

  @ApiProperty({ example: 20 })
  public limit!: number;

  @ApiProperty({ example: 3 })
  public total!: number;
}
