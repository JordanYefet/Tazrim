-- Reverts 20261024010000_transaction_reference: drops the reference and charged-currency
-- columns (their values are lost). Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261024010000_transaction_reference/down.sql
--   git checkout <commit before this migration> -- prisma/schema.prisma && npx prisma generate
-- Needs SQLite 3.35+ (DROP COLUMN).

ALTER TABLE "CreditCardTransaction" DROP COLUMN "chargedCurrency";
ALTER TABLE "CreditCardTransaction" DROP COLUMN "reference";
ALTER TABLE "BankTransaction" DROP COLUMN "reference";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261024010000_transaction_reference';
