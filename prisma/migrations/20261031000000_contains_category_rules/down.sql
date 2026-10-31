-- Reverts 20261031000000_contains_category_rules: drops the contains-text rules and
-- the cards' hand-picked flag. The categories the rules set stay on the rows. Prisma
-- never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261031000000_contains_category_rules/down.sql
--   git checkout <commit before contains rules> -- prisma/schema.prisma && npx prisma generate
--
-- Needs SQLite 3.35+ (DROP COLUMN).

DROP TABLE "CategoryKeywordRule";
ALTER TABLE "CreditCardTransaction" DROP COLUMN "categoryManual";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261031000000_contains_category_rules';
