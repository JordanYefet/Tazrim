-- Reverts 20261022000000_manual_recurring (ENG-71): drops the manual recurring series
-- and their attached / detached transactions. Detected series and their overrides stay.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261022000000_manual_recurring/down.sql
--   git checkout <commit before ENG-71> -- prisma/schema.prisma && npx prisma generate

DROP INDEX IF EXISTS "ManualRecurringMember_seriesId_transactionId_key";
DROP INDEX IF EXISTS "ManualRecurringMember_transactionId_idx";
DROP TABLE IF EXISTS "ManualRecurringMember";
DROP INDEX IF EXISTS "ManualRecurringSeries_accountId_idx";
DROP TABLE IF EXISTS "ManualRecurringSeries";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022000000_manual_recurring';
