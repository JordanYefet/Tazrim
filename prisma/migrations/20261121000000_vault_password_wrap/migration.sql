-- ENG-135: a person can open the vault with their password too. Their copy of the vault key
-- sits in VaultKeyWrap with their personId (the recovery key's copy has neither id) and the
-- scrypt parameters and salt in kdf.
ALTER TABLE "VaultKeyWrap" ADD COLUMN "personId" TEXT REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VaultKeyWrap" ADD COLUMN "kdf" TEXT;
CREATE UNIQUE INDEX "VaultKeyWrap_personId_key" ON "VaultKeyWrap"("personId");
