-- A new database starts with no accounts. 20261013000000_add_account created a Leumi
-- bank and a MAX card for the data of the time, so every new database got them too.
-- Removes each of them while it is untouched (default name, no card details or colour)
-- and nothing points at it; an account in use, or one the user set up, stays.

DELETE FROM "Account"
WHERE (("id" = 'acct_leumi' AND "displayName" = 'בנק לאומי') OR ("id" = 'acct_max' AND "displayName" = 'מקס'))
  AND "cardLastFour" IS NULL
  AND "cardNetwork" IS NULL
  AND "color" IS NULL
  AND NOT EXISTS (SELECT 1 FROM "BankTransaction" r WHERE r."accountId" = "Account"."id")
  AND NOT EXISTS (SELECT 1 FROM "CreditCardTransaction" r WHERE r."accountId" = "Account"."id")
  AND NOT EXISTS (SELECT 1 FROM "UploadHistory" r WHERE r."accountId" = "Account"."id")
  AND NOT EXISTS (SELECT 1 FROM "ImportProfile" r WHERE r."accountId" = "Account"."id")
  AND NOT EXISTS (SELECT 1 FROM "ManualRecurringSeries" r WHERE r."accountId" = "Account"."id")
  AND NOT EXISTS (SELECT 1 FROM "RecurringSeriesOverride" r WHERE r."accountId" = "Account"."id");
