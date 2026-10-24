-- Reverts 20261025000000_category_mapping: card rows get the issuer's category back
-- (the mappings are lost) and the mapping table is dropped. Prisma never runs this
-- file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261025000000_category_mapping/down.sql
--   git checkout <commit before this migration> -- prisma/schema.prisma && npx prisma generate
-- Needs SQLite 3.35+ (DROP COLUMN).

UPDATE "CreditCardTransaction" SET "category" = "sourceCategory";
ALTER TABLE "CreditCardTransaction" DROP COLUMN "sourceCategory";
DROP TABLE "CategoryMapping";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261025000000_category_mapping';
