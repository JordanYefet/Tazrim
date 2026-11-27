-- Reverts 20261127010000_vault_mailbox: forgets the waiting passkeys and their pending copies.
-- Prisma never runs this file; apply it by hand on a stopped app:
--
--   cp prisma/tazrim.db prisma/tazrim.backup.db
--   sqlite3 prisma/tazrim.db < prisma/migrations/20261127010000_vault_mailbox/down.sql
--   git checkout <commit before it> -- prisma/schema.prisma && npx prisma generate
--
-- A passkey that was waiting for a copy registers again at its next vault ceremony. Copies of the vault
-- key that passkeys already have are untouched.

DROP TABLE "VaultMailbox";

DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261127010000_vault_mailbox';
