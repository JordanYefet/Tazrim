-- Reverts 20261025030000_generic_descriptions: drops the list of generic descriptions.
-- The rules it removed and the categories it cleared do not come back. Prisma never
-- runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261025030000_generic_descriptions/down.sql
--   git checkout <commit before generic descriptions> -- prisma/schema.prisma && npx prisma generate

DROP TABLE "GenericDescription";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261025030000_generic_descriptions';
