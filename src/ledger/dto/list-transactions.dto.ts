import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Currency, TransactionType } from '../../generated/client';

export class ListTransactionsDto {
  @ApiPropertyOptional({ minimum: 1, default: 1 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  public page?: number;

  @ApiPropertyOptional({ minimum: 1, maximum: 100, default: 20 })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  @IsOptional()
  public limit?: number;

  @ApiPropertyOptional({ enum: TransactionType })
  @IsEnum(TransactionType)
  @IsOptional()
  public type?: TransactionType;

  @ApiPropertyOptional({
    enum: Currency,
    description: 'Matches the source or destination currency of a transaction.',
  })
  @IsEnum(Currency)
  @IsOptional()
  public currency?: Currency;
}
