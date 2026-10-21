-- ENG-69: edit a saved mapping without a file, and custom mappings for built-in providers.
-- ImportProfile.headers: JSON (lib/import/snapshot.ts) of the header row the mapping was
-- made on, plus a few sample rows for the preview. Stays in this local database only.
-- NULL for profiles saved before ENG-69 (their header is rebuilt from headerSignature).
-- Account.customImport: a Leumi or Max account imports through its linked mapping instead
-- of the built-in parser. 0 (the built-in importer) for every existing account.
-- AlterTable
ALTER TABLE "ImportProfile" ADD COLUMN "headers" TEXT;

-- AlterTable
ALTER TABLE "Account" ADD COLUMN "customImport" BOOLEAN NOT NULL DEFAULT false;
