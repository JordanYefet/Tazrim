-- Reverts 20261025020000_starting_categories: removes the starting categories that are
-- still unused (ones in use stay). Prisma never runs this file; apply it by hand on a
-- stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261025020000_starting_categories/down.sql

DELETE FROM "Category"
WHERE "id" LIKE 'cat_start_%'
  AND "name" NOT IN (SELECT "category" FROM "CreditCardTransaction")
  AND "name" NOT IN (SELECT "categoryOverride" FROM "CreditCardTransaction" WHERE "categoryOverride" IS NOT NULL)
  AND "name" NOT IN (SELECT "category" FROM "BankTransaction" WHERE "category" IS NOT NULL);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261025020000_starting_categories';
