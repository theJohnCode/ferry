import { PrismaClient } from '../src/generated/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

/**
 * Creates two sample wallets. Idempotent: wallets are keyed by contact, so
 * `prisma db seed` can be re-run.
 */
async function main(): Promise<void> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) } as never);

  try {
    const samples = [
      { email: 'ada@example.com', mobile: null },
      { email: 'kwame@example.com', mobile: '+2348031234567' },
    ];

    for (const sample of samples) {
      const wallet = await prisma.wallet.upsert({
        where: { email: sample.email! },
        create: sample,
        update: {},
      });
      console.log(`Ready wallet ${wallet.id} (${wallet.email})`);
    }
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
