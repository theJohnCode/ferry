import { existsSync } from 'fs';
import { config } from 'dotenv';

// The e2e suite runs against a dedicated test database (see .env.test),
// never against the development database.
if (!existsSync('.env.test')) {
  throw new Error(
    'Missing .env.test. Copy .env.test.example to .env.test and point DATABASE_URL at a test database.',
  );
}
config({ path: '.env.test', override: true });
