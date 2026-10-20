-- AlterTable
ALTER TABLE "question_options" ADD COLUMN     "is_safe" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "questions" ALTER COLUMN "photo_requirement" SET DEFAULT 'REQUIRED';
