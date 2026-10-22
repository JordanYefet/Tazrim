-- Card rows imported before the import applied merchant rules' categories get
-- the category of their provider's rule now. Rows that already have a category
-- of their own are left alone.
UPDATE "CreditCardTransaction"
SET "categoryOverride" = (
  SELECT r."categoryOverride"
  FROM "TransactionAlias" r
  JOIN "Account" a ON a."provider" = r."provider"
  WHERE a."id" = "CreditCardTransaction"."accountId"
    AND r."originalName" = "CreditCardTransaction"."originalMerchantName"
)
WHERE "categoryOverride" IS NULL
  AND EXISTS (
    SELECT 1
    FROM "TransactionAlias" r
    JOIN "Account" a ON a."provider" = r."provider"
    WHERE a."id" = "CreditCardTransaction"."accountId"
      AND r."originalName" = "CreditCardTransaction"."originalMerchantName"
      AND r."categoryOverride" IS NOT NULL
  );
