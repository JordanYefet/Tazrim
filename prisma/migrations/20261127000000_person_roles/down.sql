-- Reverts 20261127000000_person_roles: everyone has the same rights again.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261127000000_person_roles/down.sql
--   git checkout <commit before it> -- prisma/schema.prisma && npx prisma generate

ALTER TABLE "Person" DROP COLUMN "owner";
ALTER TABLE "Person" DROP COLUMN "role";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261127000000_person_roles';
