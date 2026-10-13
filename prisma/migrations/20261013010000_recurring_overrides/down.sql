-- Reverts 20261013010000_recurring_overrides (ENG-37): drops the saved
-- confirm / dismiss / rename decisions for recurring charges.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261013010000_recurring_overrides/down.sql
--   git checkout <commit before ENG-37 phase 2> -- prisma/schema.prisma && npx prisma generate

DROP INDEX IF EXISTS "RecurringSeriesOverride_baseKey_idx";
DROP INDEX IF EXISTS "RecurringSeriesOverride_key_key";
DROP TABLE IF EXISTS "RecurringSeriesOverride";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261013010000_recurring_overrides';
