-- The issuer's or bank's transaction id (Isracard's voucher number "מס' שובר", the bank's
-- "אסמכתא"), searchable, and the currency a card charged in ("מטבע חיוב"). Read from a file
-- only when its mapping has the column; existing rows: no reference, charged in ₪.

-- AlterTable
ALTER TABLE "CreditCardTransaction" ADD COLUMN "chargedCurrency" TEXT NOT NULL DEFAULT '₪';
ALTER TABLE "CreditCardTransaction" ADD COLUMN "reference" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "BankTransaction" ADD COLUMN "reference" TEXT NOT NULL DEFAULT '';
