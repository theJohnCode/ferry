import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { EnvironmentService } from './config/environment';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';

class Server {
  private static instance: Server;

  private constructor() {}

  public static getInstance(): Server {
    if (!Server.instance) {
      Server.instance = new Server();
    }
    return Server.instance;
  }

  /**
   * Add Swagger documentation
   */
  private addSwagger(app: INestApplication): void {
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
    SwaggerModule.setup('/docs', app, document, {
      jsonDocumentUrl: '/docs-json',
      swaggerOptions: { persistAuthorization: true },
    });
  }

  private addMiddleware(app: INestApplication): void {
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
  }

  private enableCors(app: INestApplication): void {
    const isDev = EnvironmentService.getValue('NODE_ENV') === 'development';
    const corsSetting = EnvironmentService.getValue('CORS_ORIGINS');
    const corsOriginsRaw =
      typeof corsSetting === 'string' ? corsSetting.trim() : '';
    const corsOrigins = corsOriginsRaw
      ? corsOriginsRaw
          .split(',')
          .map((origin: string) => origin.trim())
          .filter(Boolean)
      : [];

    app.enableCors({
      origin: isDev ? '*' : corsOrigins.length ? corsOrigins : false,
      methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
      preflightContinue: false,
      exposedHeaders: ['X-Request-Id'],
      allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'X-Request-Id',
        'Idempotency-Key',
      ],
    });
  }

  /**
   * Start the server
   */
  public async start(): Promise<void> {
    // Validate environment variables on boot
    EnvironmentService.validate();

    const app = await NestFactory.create(AppModule);
    const expressApp = app.getHttpAdapter().getInstance() as {
      get(
        path: string,
        handler: (req: unknown, res: { json: (body: object) => void }) => void,
      ): void;
    };

    expressApp.get(
      '/',
      (_req: unknown, res: { json: (body: object) => void }) => {
        res.json({ status: 'ok', service: 'Ferry API', version: '1.0.0' });
      },
    );

    this.addMiddleware(app);
    this.enableCors(app);
    this.addSwagger(app);

    const port = EnvironmentService.getValue('PORT') as number;
    const appUrl = String(EnvironmentService.getValue('APP_URL'));

    await app.listen(port);
    console.log(`Server is running on ${appUrl}`);
    console.log(`Swagger documentation: ${appUrl}/docs`);
  }
}

Server.getInstance()
  .start()
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
