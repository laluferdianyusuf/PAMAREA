-- CreateEnum
CREATE TYPE "AbsenceType" AS ENUM ('CUTI', 'SAKIT', 'IZIN', 'ALPHA');

-- CreateEnum
CREATE TYPE "AbsenceStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ReplacementStatus" AS ENUM ('ACTIVE', 'CANCELLED');

-- CreateTable
CREATE TABLE "security_absences" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "type" "AbsenceType" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "reason" VARCHAR(500),
    "status" "AbsenceStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "security_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_replacements" (
    "id" UUID NOT NULL,
    "absence_id" UUID NOT NULL,
    "original_assignment_id" UUID NOT NULL,
    "replacement_assignment_id" UUID NOT NULL,
    "replacement_user_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "status" "ReplacementStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "schedule_replacements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "security_absences_user_id_status_idx" ON "security_absences"("user_id", "status");

-- CreateIndex
CREATE INDEX "security_absences_site_id_start_date_end_date_idx" ON "security_absences"("site_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "security_absences_status_start_date_end_date_idx" ON "security_absences"("status", "start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "schedule_replacements_replacement_assignment_id_key" ON "schedule_replacements"("replacement_assignment_id");

-- CreateIndex
CREATE INDEX "schedule_replacements_absence_id_status_idx" ON "schedule_replacements"("absence_id", "status");

-- CreateIndex
CREATE INDEX "schedule_replacements_original_assignment_id_status_idx" ON "schedule_replacements"("original_assignment_id", "status");

-- CreateIndex
CREATE INDEX "schedule_replacements_replacement_user_id_start_date_end_da_idx" ON "schedule_replacements"("replacement_user_id", "start_date", "end_date");

-- AddForeignKey
ALTER TABLE "security_absences" ADD CONSTRAINT "security_absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_absences" ADD CONSTRAINT "security_absences_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "security_absences" ADD CONSTRAINT "security_absences_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_absence_id_fkey" FOREIGN KEY ("absence_id") REFERENCES "security_absences"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_original_assignment_id_fkey" FOREIGN KEY ("original_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_replacement_assignment_id_fkey" FOREIGN KEY ("replacement_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_replacement_user_id_fkey" FOREIGN KEY ("replacement_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
