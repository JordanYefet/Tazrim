-- Reverts 20261125000000_vault_password_optout: forgets who turned the password copy off.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261125000000_vault_password_optout/down.sql
--   git checkout <commit before it> -- prisma/schema.prisma && npx prisma generate
--
-- Copies of the vault key under a password are untouched.

ALTER TABLE "Person" DROP COLUMN "vaultPasswordOff";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261125000000_vault_password_optout';
