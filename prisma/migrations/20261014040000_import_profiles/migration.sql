-- ENG-24: saved column mappings ("import profiles") for providers without a built-in parser.
-- CreateTable
CREATE TABLE "ImportProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "mapping" TEXT NOT NULL,
    "headerSignature" TEXT NOT NULL,
    "accountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ImportProfile_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ImportProfile_accountKind_provider_idx" ON "ImportProfile"("accountKind", "provider");

-- CreateIndex
CREATE INDEX "ImportProfile_accountId_idx" ON "ImportProfile"("accountId");
