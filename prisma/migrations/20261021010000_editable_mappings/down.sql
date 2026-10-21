-- Reverts 20261021010000_editable_mappings (ENG-69): drops ImportProfile.headers and
-- Account.customImport. Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261021010000_editable_mappings/down.sql
--   git checkout <commit before ENG-69> -- prisma/schema.prisma && npx prisma generate
--
-- Saved mappings stay, without their stored header rows and sample rows. Leumi and Max
-- accounts that used a custom mapping go back to the built-in importer.
-- Needs SQLite 3.35+ (DROP COLUMN).

ALTER TABLE "ImportProfile" DROP COLUMN "headers";
ALTER TABLE "Account" DROP COLUMN "customImport";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261021010000_editable_mappings';
