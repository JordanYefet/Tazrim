-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Account" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "cardLastFour" TEXT,
    "cardNetwork" TEXT,
    "color" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "payerAccountId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Account_payerAccountId_fkey" FOREIGN KEY ("payerAccountId") REFERENCES "Account" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Account" ("archived", "cardLastFour", "cardNetwork", "color", "createdAt", "displayName", "id", "kind", "provider") SELECT "archived", "cardLastFour", "cardNetwork", "color", "createdAt", "displayName", "id", "kind", "provider" FROM "Account";
DROP TABLE "Account";
ALTER TABLE "new_Account" RENAME TO "Account";
CREATE INDEX "Account_kind_provider_idx" ON "Account"("kind", "provider");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

