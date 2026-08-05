-- CreateTable: a notebook folder (Note.subject) an owner has shared with another user.
-- Folders aren't real rows, so a share is keyed on owner + folder-name + recipient.
CREATE TABLE "FolderShare" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "sharedWithId" TEXT NOT NULL,
    "permission" TEXT NOT NULL DEFAULT 'view',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolderShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "FolderShare_ownerId_subject_sharedWithId_key" ON "FolderShare"("ownerId", "subject", "sharedWithId");
CREATE INDEX "FolderShare_sharedWithId_idx" ON "FolderShare"("sharedWithId");

-- AddForeignKey
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FolderShare" ADD CONSTRAINT "FolderShare_sharedWithId_fkey" FOREIGN KEY ("sharedWithId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
