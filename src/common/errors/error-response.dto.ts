import { ApiProperty } from '@nestjs/swagger';

export class ErrorResponseDto {
  @ApiProperty({ example: false })
  public success!: boolean;

  @ApiProperty({ example: 'Wallet balance is too low for this swap.' })
  public message!: string;

  @ApiProperty({
    type: [String],
    nullable: true,
    example: null,
    description: 'Validation messages, or null when there is no list.',
  })
  public errors!: string[] | null;

  @ApiProperty({ example: '2026-10-29T10:20:00.000Z' })
  public timestamp!: string;

  @ApiProperty({
    example: '/wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11/swaps',
  })
  public path!: string;

  @ApiProperty({
    format: 'uuid',
    example: 'e5a1c2b3-9f4d-4c8e-a2b7-6d1f0e3c5a04',
  })
  public requestId!: string;
}
