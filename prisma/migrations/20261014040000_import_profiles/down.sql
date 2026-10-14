-- Reverts 20261014040000_import_profiles (ENG-24): drops the saved import profiles.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261014040000_import_profiles/down.sql
--   git checkout <commit before ENG-24> -- prisma/schema.prisma && npx prisma generate
--
-- Saved mappings are lost; transactions imported with them stay.

DROP INDEX IF EXISTS "ImportProfile_accountId_idx";
DROP INDEX IF EXISTS "ImportProfile_accountKind_provider_idx";
DROP TABLE IF EXISTS "ImportProfile";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261014040000_import_profiles';
