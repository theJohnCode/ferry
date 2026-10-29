import { Injectable, Logger } from '@nestjs/common';
import * as env from 'dotenv';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { IEnvironmentVariables } from './environment.interface';
import { EnvironmentVariablesValidator } from './environment.validator';

env.config();

// `Number(value) || fallback` would silently turn an intentional 0 (for
// example FX_CACHE_SECONDS=0 in the test suite) into the fallback, so zeros
// must be recognised as configured values.
function toNumber(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

@Injectable()
export class EnvironmentService {
  private static readonly logger = new Logger(EnvironmentService.name);

  public static getValues(): Partial<IEnvironmentVariables> {
    return {
      NODE_ENV: process.env.NODE_ENV || 'development',
      PORT: toNumber(process.env.PORT, 3000),
      APP_URL:
        process.env.APP_URL || `http://localhost:${process.env.PORT || 3000}`,
      DATABASE_URL: process.env.DATABASE_URL,
      CORS_ORIGINS: process.env.CORS_ORIGINS,
      FX_PROVIDER_URL:
        process.env.FX_PROVIDER_URL || 'https://open.er-api.com/v6/latest/USD',
      FX_CACHE_SECONDS: toNumber(process.env.FX_CACHE_SECONDS, 60),
      FX_TIMEOUT_MS: toNumber(process.env.FX_TIMEOUT_MS, 3000),
    };
  }

  public static getValue(key: keyof IEnvironmentVariables): unknown {
    return this.getValues()[key];
  }

  public static validate(): void {
    const config = this.getValues();
    const errors = validateSync(
      plainToInstance(EnvironmentVariablesValidator, config),
      {
        skipMissingProperties: false,
        validationError: { target: false },
      },
    );

    if (errors.length > 0) {
      const details = errors
        .map((error) => Object.values(error.constraints ?? {}).join(', '))
        .join('; ');
      this.logger.error(`Environment validation failed: ${details}`);
      throw new Error(`Environment validation failed: ${details}`);
    }
  }
}
