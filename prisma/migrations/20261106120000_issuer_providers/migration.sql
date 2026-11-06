-- ENG-102: an account's provider is the company that issues and runs it, the same
-- company the sync logs in to (lib/sync/providers.ts). Providers typed as free text
-- before (Hebrew names, other spellings) and club brands that are a company's
-- cards (hitech = a Cal card) move to that company's key, together with the
-- rules keyed by provider. Where both keys already have a rule for the same
-- merchant / description, the company's own rule is kept.
-- Mirrors PROVIDER_ALIASES in lib/accounts/brands.ts. Unknown providers stay as
-- they are: upload-only accounts.

CREATE TEMP TABLE "_ProviderMap" ("old" TEXT PRIMARY KEY, "new" TEXT NOT NULL);
INSERT INTO "_ProviderMap" ("old", "new") VALUES
  ('לאומי', 'leumi'), ('בנק לאומי', 'leumi'),
  ('הפועלים', 'hapoalim'), ('בנק הפועלים', 'hapoalim'), ('פועלים', 'hapoalim'),
  ('דיסקונט', 'discount'), ('בנק דיסקונט', 'discount'),
  ('מזרחי', 'mizrahi'), ('מזרחי טפחות', 'mizrahi'), ('mizrahi tefahot', 'mizrahi'),
  ('מרכנתיל', 'mercantile'), ('בנק מרכנתיל', 'mercantile'),
  ('בינלאומי', 'beinleumi'), ('הבנק הבינלאומי', 'beinleumi'),
  ('אוצר החייל', 'otsarhahayal'), ('בנק אוצר החייל', 'otsarhahayal'), ('otsar hahayal', 'otsarhahayal'),
  ('מסד', 'massad'), ('בנק מסד', 'massad'),
  ('פאגי', 'pagi'), ('פאג"י', 'pagi'), ('בנק פאג"י', 'pagi'),
  ('יהב', 'yahav'), ('בנק יהב', 'yahav'),
  ('איגוד', 'union'), ('בנק איגוד', 'union'),
  ('וואן זירו', 'onezero'), ('one zero', 'onezero'),
  ('מקס', 'max'),
  ('כאל', 'cal'), ('visacal', 'cal'), ('visa cal', 'cal'),
  ('hitech', 'cal'), ('הייטקזון', 'cal'),
  ('ישראכרט', 'isracard'),
  ('אמריקן אקספרס', 'amex'), ('american express', 'amex'), ('אמקס', 'amex');

UPDATE "Account"
SET "provider" = (SELECT "new" FROM "_ProviderMap" WHERE "old" = "Account"."provider")
WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");

UPDATE "ImportProfile"
SET "provider" = (SELECT "new" FROM "_ProviderMap" WHERE "old" = "ImportProfile"."provider")
WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");

-- Rules: move what doesn't clash, then drop the clashing leftovers
UPDATE OR IGNORE "TransactionAlias"
SET "provider" = (SELECT "new" FROM "_ProviderMap" WHERE "old" = "TransactionAlias"."provider")
WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");
DELETE FROM "TransactionAlias" WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");

UPDATE OR IGNORE "CategoryMapping"
SET "provider" = (SELECT "new" FROM "_ProviderMap" WHERE "old" = "CategoryMapping"."provider")
WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");
DELETE FROM "CategoryMapping" WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");

UPDATE OR IGNORE "BankCategoryRule"
SET "provider" = (SELECT "new" FROM "_ProviderMap" WHERE "old" = "BankCategoryRule"."provider")
WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");
DELETE FROM "BankCategoryRule" WHERE "provider" IN (SELECT "old" FROM "_ProviderMap");

DROP TABLE "_ProviderMap";
