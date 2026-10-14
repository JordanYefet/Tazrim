-- Reverts 20261014030000_card_billing_date_index (ENG-46): drops the billing-date index.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261014030000_card_billing_date_index/down.sql
--   git checkout <commit before ENG-46> -- prisma/schema.prisma && npx prisma generate
--
-- Only an index: no data is lost, queries are just slower.

DROP INDEX IF EXISTS "CreditCardTransaction_accountId_billingDate_idx";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261014030000_card_billing_date_index';
