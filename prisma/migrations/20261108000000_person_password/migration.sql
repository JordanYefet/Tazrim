-- An optional password per person (ENG-89): a way in on a device without a passkey
ALTER TABLE "Person" ADD COLUMN "passwordHash" TEXT;
