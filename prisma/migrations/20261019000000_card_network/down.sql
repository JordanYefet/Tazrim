-- Reverts 20261019000000_card_network (ENG-56): drops Account.cardNetwork.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261019000000_card_network/down.sql
--   git checkout <commit before ENG-56> -- prisma/schema.prisma && npx prisma generate
--
-- The chosen networks are lost; nothing else changes. Needs SQLite 3.35+ (DROP COLUMN).

ALTER TABLE "Account" DROP COLUMN "cardNetwork";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261019000000_card_network';
