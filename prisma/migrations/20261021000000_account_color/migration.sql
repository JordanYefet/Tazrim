-- ENG-66: an optional colour per account, chosen when creating or editing it.
-- A palette key (lib/accounts/colors.ts), a #rrggbb hex, or 'glass'.
-- NULL means the brand default (the issuer's or bank's face, else the positional colour).
-- AlterTable
ALTER TABLE "Account" ADD COLUMN "color" TEXT;
