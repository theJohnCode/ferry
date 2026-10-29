import { writeFileSync } from 'fs';
import { resolve } from 'path';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from '../src/app.module';

/**
 * Exports the OpenAPI document served at /docs-json into openapi.json at the
 * repository root. The committed file is the reviewed API contract; re-run
 * `yarn openapi` whenever an endpoint or DTO changes.
 *
 * The document is built from static route/DTO metadata, so no database or
 * listening server is needed — the app is created but never initialised.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Ferry API')
    .setDescription(
      'Sandbox backend for a stablecoin cross-border payment platform: multi-currency wallets, simulated deposits, swaps, transfers and live FX rates.',
    )
    .setVersion('1.0')
    .addTag('Wallets', 'Wallet creation, balances and history')
    .addTag('Ledger', 'Deposits, swaps, transfers and single transactions')
    .addTag('Rates', 'FX conversion rates between stablecoins')
    .addTag('Health', 'Liveness and database connectivity')
    .addServer('http://localhost:3000', 'Local development')
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outPath = resolve(__dirname, '..', 'openapi.json');
  writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  await app.close();
  console.log(`OpenAPI document written to ${outPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
