-- ENG-140: a passkey with no copy of the vault key gets a "mailbox" at its first vault ceremony, so the next
-- person to open the vault leaves it a copy to collect (no two people at once). See lib/vault/mailbox.ts.
CREATE TABLE "VaultMailbox" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "passkeyId" TEXT NOT NULL,
    "prfSalt" TEXT NOT NULL,
    "publicKey" TEXT NOT NULL,
    "sealedPrivate" TEXT NOT NULL,
    "pendingKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "VaultMailbox_passkeyId_fkey" FOREIGN KEY ("passkeyId") REFERENCES "Passkey" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "VaultMailbox_passkeyId_key" ON "VaultMailbox"("passkeyId");
