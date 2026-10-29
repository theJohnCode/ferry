-- Hand-written guard rails that the Prisma schema language cannot express.

-- A balance can never go below zero. This is the last line of defence behind
-- the balance checks in LedgerService: even a bug can't create money out of
-- nothing, it can only fail loudly.
ALTER TABLE "balance"
  ADD CONSTRAINT balance_amount_non_negative CHECK (amount >= 0);

-- A wallet must be reachable by an email or a mobile number, or both.
ALTER TABLE "wallet"
  ADD CONSTRAINT wallet_has_contact CHECK (email IS NOT NULL OR mobile IS NOT NULL);

-- Only completed movements describe real money.
ALTER TABLE "transaction"
  ADD CONSTRAINT transaction_amounts_positive CHECK (
    (source_amount IS NULL OR source_amount >= 0)
    AND destination_amount >= 0
  );
