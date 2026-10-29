-- CreateEnum
CREATE TYPE "Currency" AS ENUM ('cNGN', 'cGHS', 'cXAF', 'USDx', 'EURx');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('deposit', 'swap', 'transfer');

-- CreateEnum
CREATE TYPE "RateSource" AS ENUM ('live', 'stale', 'fallback', 'fixed');

-- CreateTable
CREATE TABLE "wallet" (
    "id" UUID NOT NULL,
    "email" TEXT,
    "mobile" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "wallet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "balance" (
    "wallet_id" UUID NOT NULL,
    "currency" "Currency" NOT NULL,
    "amount" DECIMAL(30,8) NOT NULL DEFAULT 0,

    CONSTRAINT "balance_pkey" PRIMARY KEY ("wallet_id","currency")
);

-- CreateTable
CREATE TABLE "transaction" (
    "id" UUID NOT NULL,
    "type" "TransactionType" NOT NULL,
    "source_wallet_id" UUID,
    "destination_wallet_id" UUID,
    "source_currency" "Currency",
    "source_amount" DECIMAL(30,8),
    "destination_currency" "Currency" NOT NULL,
    "destination_amount" DECIMAL(30,8) NOT NULL,
    "rate" DECIMAL(30,12),
    "rate_source" "RateSource",
    "rate_fetched_at" TIMESTAMP(3),
    "initiator_wallet_id" UUID NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fx_rate" (
    "id" UUID NOT NULL,
    "base" "Currency" NOT NULL,
    "quote" "Currency" NOT NULL,
    "rate" DECIMAL(30,12) NOT NULL,
    "source" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "fx_rate_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "wallet_email_key" ON "wallet"("email");

-- CreateIndex
CREATE UNIQUE INDEX "wallet_mobile_key" ON "wallet"("mobile");

-- CreateIndex
CREATE INDEX "balance_wallet_id_idx" ON "balance"("wallet_id");

-- CreateIndex
CREATE INDEX "transaction_source_wallet_id_idx" ON "transaction"("source_wallet_id");

-- CreateIndex
CREATE INDEX "transaction_destination_wallet_id_idx" ON "transaction"("destination_wallet_id");

-- CreateIndex
CREATE INDEX "transaction_created_at_idx" ON "transaction"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "transaction_initiator_wallet_id_idempotency_key_key" ON "transaction"("initiator_wallet_id", "idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "fx_rate_base_quote_key" ON "fx_rate"("base", "quote");

-- AddForeignKey
ALTER TABLE "balance" ADD CONSTRAINT "balance_wallet_id_fkey" FOREIGN KEY ("wallet_id") REFERENCES "wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_source_wallet_id_fkey" FOREIGN KEY ("source_wallet_id") REFERENCES "wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_destination_wallet_id_fkey" FOREIGN KEY ("destination_wallet_id") REFERENCES "wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transaction" ADD CONSTRAINT "transaction_initiator_wallet_id_fkey" FOREIGN KEY ("initiator_wallet_id") REFERENCES "wallet"("id") ON DELETE CASCADE ON UPDATE CASCADE;
