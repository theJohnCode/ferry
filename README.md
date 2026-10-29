# Ferry

Ferry is a sandbox backend for a stablecoin cross-border payment platform. It exposes a REST API for multi-currency wallets, simulated deposits, swaps between stablecoins, wallet-to-wallet transfers and live FX rates. There is no frontend. It was built for the Cardtonic Backend Engineering Assessment (Operation Borderless).

Supported coins: `cNGN`, `cGHS`, `cXAF`, `USDx`, `EURx`.

## Stack

| Area | Choice |
|---|---|
| Language | Node.js (LTS) with TypeScript, strict mode |
| Framework | NestJS |
| Database | PostgreSQL 16 |
| ORM and migrations | Prisma |
| Validation | class-validator and class-transformer |
| API docs | OpenAPI through @nestjs/swagger, committed as `openapi.json` |
| Tests | Jest and Supertest |
| Tooling | Yarn, ESLint, Prettier, Docker and Docker Compose |

### Why PostgreSQL

Every operation that matters here changes two or more balances and must either fully happen or not happen at all. PostgreSQL gives me real ACID transactions, row-level locks (`SELECT ... FOR UPDATE`), exact decimal arithmetic with `NUMERIC`, and `CHECK` and `UNIQUE` constraints that act as a last line of defence when application code has a bug. A document database could do this with multi-document transactions, but the relational model fits wallets, balances and a transaction log more naturally, and the constraints are cheaper to get right.

I did not add Redis or a queue. Nothing in the scope needs one: rates are cached in memory for a minute, and every write is a short database transaction. Adding them would be more moving parts with no benefit.

## Running the project

### With Docker

```bash
docker compose up --build
```

This starts PostgreSQL and the API. Migrations are applied automatically when the API container starts. The API listens on `http://localhost:3000` and the Swagger UI is at `http://localhost:3000/docs`. Compose reads the database settings from `docker-compose.yml`, so no `.env` file is needed for this path.

To load a few sample wallets, run `docker compose exec api yarn seed`.

### Without Docker

You need Node.js LTS, Yarn and a running PostgreSQL instance (any Postgres works; a local install or a hosted database).

```bash
cp .env.example .env        # set DATABASE_URL to your database
createdb ferry_test         # only needed to run the tests
yarn install
yarn prisma migrate deploy
yarn prisma generate
yarn start:dev
```

### Environment variables

| Variable | Purpose | Default in `.env.example` |
|---|---|---|
| `NODE_ENV` | `development` enables permissive CORS | `development` |
| `PORT` | HTTP port | `3000` |
| `APP_URL` | Public URL used in startup logs | `http://localhost:3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:root@localhost:5432/ferry?schema=public` |
| `CORS_ORIGINS` | Comma-separated allowed origins outside development | empty |
| `FX_PROVIDER_URL` | Public FX API returning USD-based rates | `https://open.er-api.com/v6/latest/USD` |
| `FX_CACHE_SECONDS` | How long a fetched rate set is reused | `60` |
| `FX_TIMEOUT_MS` | Timeout for the provider call | `3000` |

## Running the tests

```bash
cp .env.test.example .env.test   # points at a separate test database
yarn test
```

`yarn test` regenerates the Prisma client, applies migrations to the test database, then runs the unit tests and the end-to-end tests. The end-to-end tests run against a real PostgreSQL database, because the locking and idempotency behaviour cannot be proven with mocks. The test database is cleared between tests. If you use Docker, `docker compose up -d db` provides PostgreSQL on `127.0.0.1:5433` (the compose file avoids 5432 so it can coexist with a local install), so point the test `DATABASE_URL` at port 5433.

The GitHub Actions workflow runs the same suite against a PostgreSQL 17 service, then starts the compose stack and calls it, so a fresh clone is proven to work with one command.

Other scripts: `yarn lint`, `yarn format`, `yarn build`, `yarn openapi` (regenerates `openapi.json`).

## API walkthrough

All amounts are strings. Every request that moves money requires an `Idempotency-Key` header (any unique string, a UUID is a good choice). The rates in the examples are illustrative.

### Create a wallet

```http
POST /wallets
Content-Type: application/json

{ "email": "ada@example.com" }
```

```json
{
  "id": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "email": "ada@example.com",
  "mobile": null,
  "createdAt": "2026-10-29T10:15:00.000Z"
}
```

A wallet is created with an `email` or a `mobile` number (or both). A second wallet with the same email or number returns `409`. Emails are lowercased and mobile numbers are normalised before the check, so `ADA@example.com` and `ada@example.com` are the same wallet.

### Deposit

```http
POST /wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11/deposits
Idempotency-Key: 1c2f0a0e-7f3f-4a8f-9d6e-52b1b0c7a001
Content-Type: application/json

{ "currency": "cNGN", "amount": "200000.00" }
```

```json
{
  "id": "0b5d2c3e-91d4-4b6e-8f2a-3a9a5d1e7c01",
  "type": "deposit",
  "destinationWalletId": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "destinationCurrency": "cNGN",
  "destinationAmount": "200000.00000000",
  "createdAt": "2026-10-29T10:16:00.000Z"
}
```

### Swap inside a wallet

```http
POST /wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11/swaps
Idempotency-Key: 8d9c5b4e-0a41-4a63-bb1c-2f3e9d5a7002
Content-Type: application/json

{ "from": "cNGN", "to": "USDx", "amount": "160000.00" }
```

```json
{
  "id": "4a7c9e10-2d6b-4f3c-a1b5-8e0d3c5f7a02",
  "type": "swap",
  "sourceWalletId": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "destinationWalletId": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "sourceCurrency": "cNGN",
  "sourceAmount": "160000.00000000",
  "destinationCurrency": "USDx",
  "destinationAmount": "100.00000000",
  "rate": "0.00062500",
  "rateSource": "live",
  "rateFetchedAt": "2026-10-29T10:18:00.000Z",
  "createdAt": "2026-10-29T10:17:00.000Z"
}
```

A swap that would make a balance negative returns `422` with an insufficient-funds message (`Not enough cNGN to swap: balance is ...`) and changes nothing.

### Transfer to another wallet

```http
POST /transfers
Idempotency-Key: 3e6b1d7a-5c2f-4e0b-9a14-6d8f0b2c7003
Content-Type: application/json

{
  "fromWalletId": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "toWalletId": "b2d1c9a4-7e35-4c1a-b0f6-91a3d4e5c812",
  "currency": "cNGN",
  "amount": "30000.00",
  "toCurrency": "cGHS"
}
```

```json
{
  "id": "7d2e4f60-1b8a-4c93-a5d7-0c6e9f1b3a03",
  "type": "transfer",
  "sourceWalletId": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "destinationWalletId": "b2d1c9a4-7e35-4c1a-b0f6-91a3d4e5c812",
  "sourceCurrency": "cNGN",
  "sourceAmount": "30000.00000000",
  "destinationCurrency": "cGHS",
  "destinationAmount": "300.00000000",
  "rate": "0.01000000",
  "rateSource": "live",
  "rateFetchedAt": "2026-10-29T10:18:00.000Z",
  "createdAt": "2026-10-29T10:18:00.000Z"
}
```

If `toCurrency` is omitted, the receiver is credited in the same currency and no conversion happens.

### Read a wallet

```http
GET /wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11
```

```json
{
  "id": "6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11",
  "balances": [
    { "currency": "cNGN", "amount": "10000.00000000" },
    { "currency": "USDx", "amount": "100.00000000" }
  ],
  "totalUsd": "106.25000000",
  "ratesFetchedAt": "2026-10-29T10:18:00.000Z"
}
```

### Transaction history

```http
GET /wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11/transactions?type=transfer&currency=cNGN&page=1&limit=20
```

Results are newest first. Each item includes a `direction` field (`sent` or `received`) so a transfer reads correctly from either wallet. The response contains `items`, `page`, `limit` and `total`. Supported filters are `type` (`deposit`, `swap`, `transfer`) and `currency`.

### Single transaction

```http
GET /transactions/7d2e4f60-1b8a-4c93-a5d7-0c6e9f1b3a03
```

### Rates

```http
GET /rates
```

```json
{
  "source": "live",
  "fetchedAt": "2026-10-29T10:18:00.000Z",
  "rates": {
    "USDx": { "cNGN": "1600", "cGHS": "16", "cXAF": "600", "EURx": "0.92" },
    "cNGN": { "USDx": "0.000625", "cGHS": "0.01" }
  }
}
```

The full response lists every pair between the five coins. All pairs come from the same provider fetch, so they share one `fetchedAt`; `source` says whether that fetch was live, the last stored rates (`stale`) or the fixed table (`fallback`).

### Errors

Every error uses the same shape:

```json
{
  "success": false,
  "message": "Wallet balance is too low for this swap.",
  "errors": null,
  "timestamp": "2026-10-29T10:20:00.000Z",
  "path": "/wallets/6f0e5a52-3b3c-4d3a-8a55-0f5b7a0f2c11/swaps",
  "requestId": "e5a1c2b3-9f4d-4c8e-a2b7-6d1f0e3c5a04"
}
```

For validation failures the first problem goes in `message` and the full list goes in `errors`.

| Status | Used for |
|---|---|
| 400 | Invalid input, missing `Idempotency-Key` |
| 404 | Unknown wallet or transaction |
| 409 | Wallet already exists for that email or mobile number |
| 422 | Insufficient funds, or an idempotency key reused with a different body |

## Data model

| Table | Purpose |
|---|---|
| `Wallet` | `id`, unique `email`, unique `mobile`, `createdAt`. A check constraint requires at least one of email or mobile. |
| `Balance` | One row per wallet and currency: `amount NUMERIC(30,8)`, primary key `(walletId, currency)`, check constraint `amount >= 0`. |
| `Transaction` | One row per deposit, swap or transfer, with source and destination wallet, currency and amount, the rate applied, the rate source, the idempotency key and a request hash. Unique on `(initiatorWalletId, idempotencyKey)`. |
| `FxRate` | The last rates fetched, with source and fetch time. Unique on `(base, quote)`. |

A transfer is stored once and shows up in both wallets' history through the source and destination columns. The `CHECK` constraints are not expressible in the Prisma schema, so they are added by hand in the SQL of the `add_checks` migration.

## How the hard parts are handled

### Money precision

Money never touches a JavaScript `number`. Amounts arrive as strings, are validated (positive, at most 8 decimal places and below 10^22) and are converted to `Prisma.Decimal`, which wraps decimal.js. decimal.js is configured to 40 significant digits so a `DECIMAL(30,8)` value survives intermediate arithmetic unchanged. Values are stored as `NUMERIC(30,8)`. Converted amounts are rounded down to 8 decimal places, so rounding can never create value for the platform to owe. A conversion whose result would not fit the column is rejected with `422` instead of failing at the database. The rate applied is saved on each transaction (to 12 decimal places) together with its source and fetch time, so any conversion can be traced later.

### Idempotency

Deposits, swaps and transfers require an `Idempotency-Key` header. The key is stored on the transaction row inside the same database transaction that moves the money, under a unique index on the initiating wallet and the key. A repeat request returns the original transaction with its original status code and changes nothing. A hash of the request body is stored too, so the same key sent with a different body is rejected with `422`. When two identical requests arrive at the same moment, the unique index lets exactly one insert win, and the other falls back to returning the stored result. Because PostgreSQL aborts a transaction after a unique violation, the lookup of the original is done outside the failed transaction.

### Concurrency

Swaps and transfers run in an interactive Prisma transaction. Inside it, the balance rows involved are locked with a raw `SELECT ... FOR UPDATE`, always ordered by wallet id and then currency, so two transfers in opposite directions cannot deadlock. Missing balance rows are created first with `INSERT ... ON CONFLICT DO NOTHING`. The balance is checked after the lock is held, and the `amount >= 0` constraint in the database stands behind that check. One of the end-to-end tests fires 20 parallel transfers against a balance that can afford only 10 of them, and asserts that exactly 10 succeed and the balance ends at zero.

### FX rate failures

Rates come from a public API (`open.er-api.com`, USD base) and every pair is computed through USD. A successful fetch is cached in memory for 60 seconds and saved to the `FxRate` table. If the provider times out or returns an error, the service uses the last saved rates and marks the response with `"source": "stale"`. If nothing has ever been saved, it uses a fixed fallback table defined in code and marks the response `"source": "fallback"`. Every swap, transfer and rates response says which source was used and when the rates were last refreshed.

## Assumptions

- Each coin is treated as tracking its fiat currency one to one: cNGN to NGN, cGHS to GHS, cXAF to XAF, USDx to USD and EURx to EUR.
- There are no fees or spreads. The rate applied is the mid rate.
- A wallet with only a mobile number is valid, and numbers are normalised to E.164.
- Deposits are simulated and need no payment provider.
- A transfer to the same wallet is rejected, because that is a swap.

## Known limitations

- There is no authentication or authorisation. Anyone who knows a wallet id can act on it, as the brief allows.
- The transaction table is the only record of money movement. A double-entry ledger would be a stronger audit trail.
- Rates are cached per process. Several API instances would each fetch their own, which is acceptable here and would want a shared cache in production.
- History uses offset pagination, which gets slower on very large wallets.
- Idempotency keys are never expired.
- The fallback rate table is static and will drift from the market.

## With more time

- Authentication, API keys per client and rate limiting.
- A double-entry ledger with a reconciliation job.
- Cursor-based pagination for history.
- Webhooks for completed transfers, delivered through a queue with retries.
- Fees and spreads per pair, and a quote step that locks a rate for a few seconds before the swap.
- Expiry for idempotency keys and metrics for rate source and lock wait times.

## Project layout

```
prisma/              schema, migrations and seed data
src/wallets/         wallet creation and balances
src/ledger/          deposits, swaps, transfers and history
src/rates/           FX provider, cache and fallback table
src/common/          money helpers, errors, idempotency and the exception filter
test/                end-to-end tests
scripts/             OpenAPI export
.github/workflows/   CI: tests, lint and the docker compose smoke test
openapi.json         committed API contract, regenerated with `yarn openapi`
```
