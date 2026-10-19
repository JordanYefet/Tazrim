-- ENG-56: optional card network (visa / mastercard / amex / diners) shown on the card element.
-- NULL means unknown or other; bank accounts always keep NULL.
-- AlterTable
ALTER TABLE "Account" ADD COLUMN "cardNetwork" TEXT;
