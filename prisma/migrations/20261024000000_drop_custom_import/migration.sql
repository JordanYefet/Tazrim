-- Every provider imports through a column mapping: the built-in Leumi and Max readers are
-- gone, so Account.customImport (ENG-69: "this Leumi / Max account uses its mapping
-- instead of the built-in reader") no longer means anything. Saved mappings are untouched.
-- Needs SQLite 3.35+ (DROP COLUMN).

-- AlterTable
ALTER TABLE "Account" DROP COLUMN "customImport";
