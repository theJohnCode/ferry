import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsEmail, IsOptional, Matches } from 'class-validator';

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

// Accepts "0803 123 4567", "+234 803 123 4567" and "2348031234567"; strips
// spacing, treats bare digits as Nigerian local numbers, and normalises to
// E.164 so the same number cannot create two wallets.
export function normalizeMobile(mobile: string): string {
  const digits = mobile.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+')) {
    return `+${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return `+${digits}`;
  }
  if (digits.startsWith('0')) {
    return `+234${digits.slice(1)}`;
  }
  return `+${digits}`;
}

export class CreateWalletDto {
  @ApiPropertyOptional({ example: 'ada@example.com' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? normalizeEmail(value) : value,
  )
  @IsEmail({}, { message: 'email must be a valid email address.' })
  @IsOptional()
  public email!: string;

  @ApiPropertyOptional({ example: '+2348031234567' })
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' && value.trim() !== ''
      ? normalizeMobile(value)
      : undefined,
  )
  @Matches(/^\+[1-9]\d{7,14}$/, {
    message: 'mobile must be a valid E.164 phone number.',
  })
  @IsOptional()
  public mobile!: string;
}
