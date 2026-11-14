-- A person's own choices, the same on every device they sign in on (the page background)
CREATE TABLE "PersonPreference" (
    "personId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "updatedAt" DATETIME NOT NULL,

    PRIMARY KEY ("personId", "key"),
    CONSTRAINT "PersonPreference_personId_fkey" FOREIGN KEY ("personId") REFERENCES "Person" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
