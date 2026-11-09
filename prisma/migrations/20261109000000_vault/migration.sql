-- ENG-90: the vault for bank and card sign-ins
CREATE TABLE "VaultKeyWrap" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passkeyId" TEXT,
    "prfSalt" TEXT,
    "wrappedKey" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultKeyWrap_passkeyId_fkey" FOREIGN KEY ("passkeyId") REFERENCES "Passkey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VaultKeyWrap_passkeyId_key" ON "VaultKeyWrap"("passkeyId");

CREATE TABLE "BankCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "company" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "accountId" TEXT,
    "sealed" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BankCredential_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "BankCredential_accountId_idx" ON "BankCredential"("accountId");
