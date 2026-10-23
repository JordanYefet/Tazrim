-- Reverts 20261022020000_backfill_rule_categories in the migration history only.
-- The categories it set stay: they are what the merchant rules say, and nothing
-- tells them apart from categories set by hand. Prisma never runs this file:
--
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261022020000_backfill_rule_categories/down.sql

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261022020000_backfill_rule_categories';
