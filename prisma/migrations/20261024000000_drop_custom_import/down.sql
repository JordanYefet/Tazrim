-- Reverts 20261024000000_drop_custom_import: adds Account.customImport back, 0 (false) for
-- every account. Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261024000000_drop_custom_import/down.sql
--   git checkout <commit before this migration> -- prisma/schema.prisma && npx prisma generate

ALTER TABLE "Account" ADD COLUMN "customImport" BOOLEAN NOT NULL DEFAULT false;

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261024000000_drop_custom_import';
