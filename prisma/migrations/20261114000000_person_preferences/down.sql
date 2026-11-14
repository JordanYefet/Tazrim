-- Reverts 20261114000000_person_preferences: drops PersonPreference.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261114000000_person_preferences/down.sql
--   git checkout <commit before it> -- prisma/schema.prisma && npx prisma generate
--
-- Each person's saved background is lost; every device then shows the one in its own
-- cookie, as before. Nothing else changes.

DROP TABLE "PersonPreference";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261114000000_person_preferences';
