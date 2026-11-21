-- Reverts 20261121000000_vault_password_wrap: drops every password copy of the vault key.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261121000000_vault_password_wrap/down.sql
--   git checkout <commit before it> -- prisma/schema.prisma && npx prisma generate
--
-- People lose "open the vault with my password" and turn it on again later. Passkey and
-- recovery-key copies are untouched.

DELETE FROM "VaultKeyWrap" WHERE "personId" IS NOT NULL;
DROP INDEX "VaultKeyWrap_personId_key";
ALTER TABLE "VaultKeyWrap" DROP COLUMN "kdf";
ALTER TABLE "VaultKeyWrap" DROP COLUMN "personId";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261121000000_vault_password_wrap';
