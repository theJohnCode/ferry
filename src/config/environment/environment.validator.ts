import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { IEnvironmentVariables } from './environment.interface';

export class EnvironmentVariablesValidator implements IEnvironmentVariables {
  @IsString()
  NODE_ENV!: string;

  @IsNumber()
  @Min(1)
  PORT!: number;

  @IsString()
  APP_URL!: string;

  @IsString()
  @IsNotEmpty()
  DATABASE_URL!: string;

  @IsString()
  @IsOptional()
  CORS_ORIGINS!: string;

  @IsString()
  @IsNotEmpty()
  FX_PROVIDER_URL!: string;

  @IsNumber()
  @Min(1)
  FX_CACHE_SECONDS!: number;

  @IsNumber()
  @Min(1)
  FX_TIMEOUT_MS!: number;
}
