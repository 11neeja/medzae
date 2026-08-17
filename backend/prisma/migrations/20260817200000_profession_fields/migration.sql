-- Profession-shaped profile details.
--
-- The first cut asked everyone the same four questions, which only ever suited
-- students: a consultant has no "year of study", and a professor's institution
-- is a department, not a college. The profession now drives which fields the
-- form asks for, so these columns are shared across professions and relabelled
-- rather than duplicated per role.
ALTER TABLE "User" ADD COLUMN "specialty" TEXT;
ALTER TABLE "User" ADD COLUMN "qualification" TEXT;
ALTER TABLE "User" ADD COLUMN "designation" TEXT;
ALTER TABLE "User" ADD COLUMN "yearsExperience" INTEGER;

-- The stage list collapsed from seven values to five. Fold the retired ones
-- into their nearest survivor so no existing profile is left holding a value
-- the form can no longer display.
UPDATE "User" SET "careerStage" = 'doctor'
  WHERE "careerStage" IN ('intern', 'resident', 'practitioner');
UPDATE "User" SET "careerStage" = 'professor'
  WHERE "careerStage" = 'faculty';
