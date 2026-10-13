-- Reverts 20261013020000_unusual_dismissals (ENG-38): drops the dismissals table.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261013020000_unusual_dismissals/down.sql
--   git checkout <commit before ENG-38> -- prisma/schema.prisma && npx prisma generate
--
-- The user's "not unusual" marks are lost; nothing else references this table.

DROP INDEX IF EXISTS "UnusualDismissal_source_transactionId_key";
DROP TABLE IF EXISTS "UnusualDismissal";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261013020000_unusual_dismissals';
