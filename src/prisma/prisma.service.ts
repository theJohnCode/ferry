import {
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { PrismaClient } from '../generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { EnvironmentService } from '../config/environment';

/* eslint-disable @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging --
   Declaration merging gives the injected service the generated PrismaClient
   model delegates; the Proxy below forwards them to the wrapped client. */
export interface PrismaService extends PrismaClient {}

// Small app, but 20 parallel transfers in the e2e suite need more than the pg
// default of 10 pooled connections while each one holds the pool inside an
// interactive transaction.
const POOL_MAX = 25;

@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  private readonly client: PrismaClient;
  private readonly pool: Pool;

  constructor() {
    const url = EnvironmentService.getValue('DATABASE_URL') as string;

    const pool = new Pool({ connectionString: url, max: POOL_MAX });
    const adapter = new PrismaPg(pool);
    this.pool = pool;

    this.client = new PrismaClient({ adapter } as never);

    // Delegate model access (this.wallet, this.balance, ...) to the client so
    // PrismaService can keep its own lifecycle methods.
    return new Proxy(this, {
      get: (target, prop) => {
        if (prop in target) {
          const value = (target as Record<string | symbol, unknown>)[prop];
          const resolved =
            typeof value === 'function'
              ? (value.bind(target) as unknown)
              : value;
          return resolved;
        }
        const clientValue = (
          target.client as unknown as Record<string | symbol, unknown>
        )[prop];
        const resolved =
          typeof clientValue === 'function'
            ? (clientValue.bind(target.client) as unknown)
            : clientValue;
        return resolved;
      },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.client.$connect();
      await this.client.$queryRaw`SELECT 1`;
      this.logger.log('Prisma connected and DB connectivity verified');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Database connection failed: ${message}`);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    // Prisma does not own the driver-adapter pool, so it stays open unless it
    // is ended explicitly; an open pool keeps Jest (and the process) alive.
    await this.client.$disconnect();
    await this.pool.end();
    this.logger.log('Prisma disconnected');
  }
}
