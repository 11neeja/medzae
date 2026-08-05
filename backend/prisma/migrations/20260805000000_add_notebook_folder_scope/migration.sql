-- AlterTable: notebook tasks and documents now live inside a folder (Note.subject).
-- Nullable so existing rows stay valid; the notebook surfaces them as "Unfiled".
ALTER TABLE "Task" ADD COLUMN     "subject" TEXT;
ALTER TABLE "Document" ADD COLUMN     "subject" TEXT;

-- CreateIndex
CREATE INDEX "Task_userId_subject_idx" ON "Task"("userId", "subject");
CREATE INDEX "Document_userId_source_subject_idx" ON "Document"("userId", "source", "subject");
