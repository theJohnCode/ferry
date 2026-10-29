import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { Currency } from '../../generated/client';
import { IsMoneyString } from '../../common/money/is-money-string.decorator';

export class TransferDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  public fromWalletId!: string;

  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  public toWalletId!: string;

  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  @IsEnum(Currency)
  public currency!: Currency;

  @ApiProperty({ example: '30000.00' })
  @IsMoneyString()
  public amount!: string;

  @ApiPropertyOptional({
    enum: Currency,
    description:
      'Currency the receiver is credited in. Defaults to `currency`.',
  })
  @IsEnum(Currency)
  @IsOptional()
  public toCurrency?: Currency;
}
