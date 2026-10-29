import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';
import { Currency } from '../../generated/client';
import { IsMoneyString } from '../../common/money/is-money-string.decorator';
import { IsDifferentFrom } from '../../common/validators/is-different-from.decorator';

export class SwapDto {
  @ApiProperty({ enum: Currency, example: Currency.cNGN })
  @IsEnum(Currency)
  public from!: Currency;

  @ApiProperty({ enum: Currency, example: Currency.USDx })
  @IsEnum(Currency)
  @IsDifferentFrom('from', {
    message: 'to must be different from from; a swap needs two currencies.',
  })
  public to!: Currency;

  @ApiProperty({
    example: '160000.00',
    description: 'Amount of `from` to swap.',
  })
  @IsMoneyString()
  public amount!: string;
}
