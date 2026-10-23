-- Reverts 20261023000000_bank_categories: drops bank categories, their rules
-- and the income/expense kind of categories (income categories become plain
-- ones). Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261023000000_bank_categories/down.sql
--   git checkout <commit before bank categories> -- prisma/schema.prisma && npx prisma generate
--
-- Needs SQLite 3.35+ (DROP COLUMN).

DROP TABLE "BankCategoryRule";
ALTER TABLE "BankTransaction" DROP COLUMN "category";
ALTER TABLE "BankTransaction" DROP COLUMN "categoryManual";
ALTER TABLE "Category" DROP COLUMN "kind";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261023000000_bank_categories';
