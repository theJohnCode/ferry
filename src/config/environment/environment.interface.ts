export interface IEnvironmentVariables {
  NODE_ENV: string;
  PORT: number;
  APP_URL: string;
  DATABASE_URL: string;
  CORS_ORIGINS: string;
  FX_PROVIDER_URL: string;
  FX_CACHE_SECONDS: number;
  FX_TIMEOUT_MS: number;
}
