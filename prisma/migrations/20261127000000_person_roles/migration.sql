-- ENG-140: permission levels. Everyone is a member, except the person who installed it (the earliest
-- created), who becomes the owner and an admin; the owner promotes whom they want in Settings → People.
ALTER TABLE "Person" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'member';
ALTER TABLE "Person" ADD COLUMN "owner" BOOLEAN NOT NULL DEFAULT false;
UPDATE "Person" SET "owner" = true, "role" = 'admin'
  WHERE "id" = (SELECT "id" FROM "Person" ORDER BY "createdAt" ASC, "id" ASC LIMIT 1);
