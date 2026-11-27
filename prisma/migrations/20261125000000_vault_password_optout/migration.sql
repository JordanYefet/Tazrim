-- ENG-139: the vault's password copy now turns on by itself (the next password sign-in while the
-- vault is open). A person who turned it off on purpose is remembered here, so it stays off until
-- they turn it on again.
ALTER TABLE "Person" ADD COLUMN "vaultPasswordOff" BOOLEAN NOT NULL DEFAULT false;
