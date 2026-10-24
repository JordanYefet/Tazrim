-- Reverts 20261025010000_no_default_accounts: puts back the default Leumi bank and MAX
-- card when they are missing. Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261025010000_no_default_accounts/down.sql

INSERT OR IGNORE INTO "Account" ("id", "kind", "provider", "displayName", "cardLastFour", "archived", "createdAt") VALUES
    ('acct_leumi', 'BANK', 'leumi', 'בנק לאומי', NULL, false, 1791849600000),
    ('acct_max', 'CREDIT_CARD', 'max', 'מקס', NULL, false, 1791849600000);

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261025010000_no_default_accounts';
