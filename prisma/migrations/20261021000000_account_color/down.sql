-- Reverts 20261021000000_account_color (ENG-66): drops Account.color.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261021000000_account_color/down.sql
--   git checkout <commit before ENG-66> -- prisma/schema.prisma && npx prisma generate
--
-- The chosen colours are lost (every account goes back to its brand default);
-- nothing else changes. Needs SQLite 3.35+ (DROP COLUMN).

ALTER TABLE "Account" DROP COLUMN "color";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261021000000_account_color';
