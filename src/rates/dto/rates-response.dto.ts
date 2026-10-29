import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Currency } from '../../generated/client';

export class RatesResponseDto {
  @ApiProperty({
    enum: ['live', 'stale', 'fallback'],
    description:
      'Where the rates came from: the live provider, the last stored rates, or the fixed table.',
    example: 'live',
  })
  public source!: 'live' | 'stale' | 'fallback';

  @ApiPropertyOptional({
    type: String,
    nullable: true,
    description: 'When the rates were fetched. Null only for the fixed table.',
    example: '2026-10-29T10:18:00.000Z',
  })
  public fetchedAt!: string | null;

  @ApiProperty({
    type: 'object',
    additionalProperties: {
      type: 'object',
      additionalProperties: { type: 'string', example: '1600' },
    },
    description:
      'Every pair between the five supported coins: rates[base][quote].',
    example: {
      cNGN: { USDx: '0.000625', cGHS: '0.01' },
      USDx: { cNGN: '1600', cGHS: '16' },
    },
  })
  public rates!: Record<Currency, Record<Currency, string>>;
}
