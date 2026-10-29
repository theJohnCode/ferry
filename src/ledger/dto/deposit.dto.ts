import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency } from '../../generated/client';
import { IsMoneyString } from '../../common/money/is-money-string.decorator';

export class DepositDto {
  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  @IsEnum(Currency)
  public currency!: Currency;

  @ApiProperty({
    example: '200000.00',
    description: 'Amount as a decimal string.',
  })
  @IsMoneyString()
  public amount!: string;
}
