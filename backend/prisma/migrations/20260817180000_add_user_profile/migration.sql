-- User profiles. Until now a user was a name, an email and a password: the
-- avatar shown next to every post was derived at render time by guessing a
-- gender from the display name. This replaces that guess with a stored choice
-- (uploaded photo, or `preset:<id>` from the frontend catalog) and gives the
-- account real, optional details.
ALTER TABLE "User" ADD COLUMN "avatarUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "headline" TEXT;
ALTER TABLE "User" ADD COLUMN "bio" TEXT;
ALTER TABLE "User" ADD COLUMN "careerStage" TEXT;
ALTER TABLE "User" ADD COLUMN "institution" TEXT;
ALTER TABLE "User" ADD COLUMN "studyYear" TEXT;
ALTER TABLE "User" ADD COLUMN "graduationYear" INTEGER;
ALTER TABLE "User" ADD COLUMN "city" TEXT;
ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "websiteUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "linkedinUrl" TEXT;
ALTER TABLE "User" ADD COLUMN "twitterUrl" TEXT;

-- Private by default: existing accounts never agreed to be listed publicly,
-- so nobody's details become visible as a side effect of this migration.
ALTER TABLE "User" ADD COLUMN "isProfilePublic" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "showEmail" BOOLEAN NOT NULL DEFAULT false;

-- Email changes land here first and only move into "email" once the owner
-- clicks the confirmation link sent to the NEW address.
ALTER TABLE "User" ADD COLUMN "pendingEmail" TEXT;
ALTER TABLE "User" ADD COLUMN "emailChangeToken" TEXT;
ALTER TABLE "User" ADD COLUMN "emailChangeExpires" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "User_emailChangeToken_key" ON "User"("emailChangeToken");
