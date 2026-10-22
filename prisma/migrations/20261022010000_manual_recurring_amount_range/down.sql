-- Reverts 20261022010000_manual_recurring_amount_range (ENG-71): drops the optional
-- amount range of manual recurring series. The series stay, matching by description
-- and day window only. Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261022010000_manual_recurring_amount_range/down.sql
--   git checkout <commit before the amount range> -- prisma/schema.prisma && npx prisma generate
--
-- Needs SQLite 3.35+ (DROP COLUMN).

ALTER TABLE "ManualRecurringSeries" DROP COLUMN "amountMin";
ALTER TABLE "ManualRecurringSeries" DROP COLUMN "amountMax";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022010000_manual_recurring_amount_range';
