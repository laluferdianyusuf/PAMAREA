/*
  Warnings:

  - You are about to alter the column `file_size` on the `finding_photos` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to drop the column `created_by` on the `nfc_tags` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `patrol_assignments` table. All the data in the column will be lost.
  - You are about to alter the column `file_size` on the `patrol_photos` table. The data in that column could be lost. The data in that column will be cast from `BigInt` to `Integer`.
  - You are about to drop the column `created_by` on the `patrol_point_nfc` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `patrol_points` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `patrol_schedules` table. All the data in the column will be lost.
  - The `status` column on the `patrol_schedules` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - You are about to drop the column `assignment_id` on the `patrols` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `point_questions` table. All the data in the column will be lost.
  - You are about to drop the column `created_by` on the `questions` table. All the data in the column will be lost.
  - You are about to drop the column `updated_at` on the `sessions` table. All the data in the column will be lost.
  - Made the column `file_name` on table `finding_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mime_type` on table `finding_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `file_size` on table `finding_photos` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `created_by_id` to the `nfc_tags` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `patrol_answers` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `patrol_assignments` table without a default value. This is not possible if the table is not empty.
  - Made the column `file_name` on table `patrol_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `mime_type` on table `patrol_photos` required. This step will fail if there are existing NULL values in that column.
  - Made the column `file_size` on table `patrol_photos` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `created_by_id` to the `patrol_point_nfc` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `patrol_points` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `patrol_schedules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `interval_minutes` to the `patrol_schedules` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `point_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updated_at` to the `point_questions` table without a default value. This is not possible if the table is not empty.
  - Added the required column `created_by_id` to the `questions` table without a default value. This is not possible if the table is not empty.
  - Made the column `created_by_id` on table `sites` required. This step will fail if there are existing NULL values in that column.

*/
-- CreateEnum
CREATE TYPE "ScheduleStatus" AS ENUM ('DRAFT', 'ACTIVE', 'INACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ScheduleDateStatus" AS ENUM ('SCHEDULED', 'CANCELLED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ScheduleAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PatrolRoundStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'PARTIAL', 'MISSED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PatrolCheckpointStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'LATE', 'MISSED', 'FAILED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "PatrolStatus" ADD VALUE 'CANCELLED';

-- DropForeignKey
ALTER TABLE "findings" DROP CONSTRAINT "findings_patrol_id_fkey";

-- DropForeignKey
ALTER TABLE "nfc_tags" DROP CONSTRAINT "nfc_tags_created_by_fkey";

-- DropForeignKey
ALTER TABLE "patrol_assignments" DROP CONSTRAINT "patrol_assignments_created_by_fkey";

-- DropForeignKey
ALTER TABLE "patrol_point_nfc" DROP CONSTRAINT "patrol_point_nfc_created_by_fkey";

-- DropForeignKey
ALTER TABLE "patrol_points" DROP CONSTRAINT "patrol_points_created_by_fkey";

-- DropForeignKey
ALTER TABLE "patrol_schedules" DROP CONSTRAINT "patrol_schedules_created_by_fkey";

-- DropForeignKey
ALTER TABLE "patrols" DROP CONSTRAINT "patrols_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "point_questions" DROP CONSTRAINT "point_questions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "point_questions" DROP CONSTRAINT "point_questions_patrol_point_id_fkey";

-- DropForeignKey
ALTER TABLE "questions" DROP CONSTRAINT "questions_created_by_fkey";

-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_created_by_id_fkey";

-- DropIndex
DROP INDEX "audit_logs_action_idx";

-- DropIndex
DROP INDEX "audit_logs_user_id_created_at_idx";

-- DropIndex
DROP INDEX "findings_created_at_idx";

-- DropIndex
DROP INDEX "findings_resolved_by_idx";

-- DropIndex
DROP INDEX "patrol_answers_patrol_id_idx";

-- DropIndex
DROP INDEX "patrol_assignments_end_date_idx";

-- DropIndex
DROP INDEX "patrol_assignments_start_date_idx";

-- DropIndex
DROP INDEX "patrol_photos_captured_at_idx";

-- DropIndex
DROP INDEX "patrol_point_nfc_assigned_at_idx";

-- DropIndex
DROP INDEX "patrol_point_nfc_unassigned_at_idx";

-- DropIndex
DROP INDEX "patrol_points_deleted_at_idx";

-- DropIndex
DROP INDEX "patrol_points_name_idx";

-- DropIndex
DROP INDEX "patrols_assignment_id_idx";

-- DropIndex
DROP INDEX "patrols_nfc_bypass_idx";

-- DropIndex
DROP INDEX "patrols_nfc_tag_id_idx";

-- DropIndex
DROP INDEX "patrols_patrol_point_id_started_at_idx";

-- DropIndex
DROP INDEX "patrols_site_id_started_at_idx";

-- DropIndex
DROP INDEX "patrols_user_id_started_at_idx";

-- DropIndex
DROP INDEX "questions_question_type_idx";

-- DropIndex
DROP INDEX "sites_name_idx";

-- DropIndex
DROP INDEX "users_created_by_id_idx";

-- DropIndex
DROP INDEX "users_full_name_idx";

-- AlterTable
ALTER TABLE "audit_logs" ALTER COLUMN "ip_address" SET DATA TYPE VARCHAR(100);

-- AlterTable
ALTER TABLE "finding_photos" ALTER COLUMN "file_name" SET NOT NULL,
ALTER COLUMN "mime_type" SET NOT NULL,
ALTER COLUMN "file_size" SET NOT NULL,
ALTER COLUMN "file_size" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "findings" ALTER COLUMN "description" DROP NOT NULL;

-- AlterTable
ALTER TABLE "nfc_tags" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "patrol_answers" ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "patrol_assignments" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "patrol_photos" ALTER COLUMN "file_name" SET NOT NULL,
ALTER COLUMN "mime_type" SET NOT NULL,
ALTER COLUMN "file_size" SET NOT NULL,
ALTER COLUMN "file_size" SET DATA TYPE INTEGER;

-- AlterTable
ALTER TABLE "patrol_point_nfc" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "patrol_points" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "patrol_schedules" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "enforce_sequence" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "grace_period_minutes" INTEGER NOT NULL DEFAULT 30,
ADD COLUMN     "interval_minutes" INTEGER NOT NULL,
ADD COLUMN     "userId" UUID,
DROP COLUMN "status",
ADD COLUMN     "status" "ScheduleStatus" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "patrols" DROP COLUMN "assignment_id",
ADD COLUMN     "checkpoint_id" UUID,
ADD COLUMN     "patrolAssignmentId" UUID,
ADD COLUMN     "schedule_assignment_id" UUID;

-- AlterTable
ALTER TABLE "point_questions" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "questions" DROP COLUMN "created_by",
ADD COLUMN     "created_by_id" UUID NOT NULL;

-- AlterTable
ALTER TABLE "sessions" DROP COLUMN "updated_at";

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "created_by_id" SET NOT NULL;

-- AlterTable
ALTER TABLE "user_devices" ALTER COLUMN "platform" DROP NOT NULL,
ALTER COLUMN "platform" SET DATA TYPE VARCHAR(50);

-- CreateTable
CREATE TABLE "patrol_schedule_dates" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "status" "ScheduleDateStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_by_id" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_schedule_dates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_schedule_assignments" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "ScheduleAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_schedule_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_rounds" (
    "id" UUID NOT NULL,
    "schedule_date_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "round_number" INTEGER NOT NULL,
    "scheduled_start_at" TIMESTAMP(3) NOT NULL,
    "scheduled_end_at" TIMESTAMP(3) NOT NULL,
    "status" "PatrolRoundStatus" NOT NULL DEFAULT 'PENDING',
    "started_at" TIMESTAMP(3),
    "completed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_rounds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_checkpoints" (
    "id" UUID NOT NULL,
    "round_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "status" "PatrolCheckpointStatus" NOT NULL DEFAULT 'PENDING',
    "point_code_snapshot" VARCHAR(50) NOT NULL,
    "point_name_snapshot" VARCHAR(150) NOT NULL,
    "radius_meters_snapshot" INTEGER NOT NULL,
    "visited_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrol_schedule_dates_date_status_idx" ON "patrol_schedule_dates"("date", "status");

-- CreateIndex
CREATE INDEX "patrol_schedule_dates_schedule_id_status_idx" ON "patrol_schedule_dates"("schedule_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_schedule_dates_schedule_id_date_key" ON "patrol_schedule_dates"("schedule_id", "date");

-- CreateIndex
CREATE INDEX "patrol_schedule_assignments_schedule_id_status_idx" ON "patrol_schedule_assignments"("schedule_id", "status");

-- CreateIndex
CREATE INDEX "patrol_schedule_assignments_user_id_status_idx" ON "patrol_schedule_assignments"("user_id", "status");

-- CreateIndex
CREATE INDEX "patrol_schedule_assignments_start_date_end_date_idx" ON "patrol_schedule_assignments"("start_date", "end_date");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_schedule_assignments_schedule_id_user_id_start_date_key" ON "patrol_schedule_assignments"("schedule_id", "user_id", "start_date");

-- CreateIndex
CREATE INDEX "patrol_rounds_schedule_date_id_idx" ON "patrol_rounds"("schedule_date_id");

-- CreateIndex
CREATE INDEX "patrol_rounds_assignment_id_idx" ON "patrol_rounds"("assignment_id");

-- CreateIndex
CREATE INDEX "patrol_rounds_scheduled_start_at_scheduled_end_at_idx" ON "patrol_rounds"("scheduled_start_at", "scheduled_end_at");

-- CreateIndex
CREATE INDEX "patrol_rounds_status_idx" ON "patrol_rounds"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_rounds_schedule_date_id_assignment_id_round_number_key" ON "patrol_rounds"("schedule_date_id", "assignment_id", "round_number");

-- CreateIndex
CREATE INDEX "patrol_checkpoints_round_id_status_idx" ON "patrol_checkpoints"("round_id", "status");

-- CreateIndex
CREATE INDEX "patrol_checkpoints_patrol_point_id_idx" ON "patrol_checkpoints"("patrol_point_id");

-- CreateIndex
CREATE INDEX "patrol_checkpoints_status_idx" ON "patrol_checkpoints"("status");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_checkpoints_round_id_patrol_point_id_key" ON "patrol_checkpoints"("round_id", "patrol_point_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_idx" ON "audit_logs"("user_id");

-- CreateIndex
CREATE INDEX "patrol_assignments_start_date_end_date_idx" ON "patrol_assignments"("start_date", "end_date");

-- CreateIndex
CREATE INDEX "patrol_schedules_site_id_status_idx" ON "patrol_schedules"("site_id", "status");

-- CreateIndex
CREATE INDEX "patrol_schedules_created_by_id_idx" ON "patrol_schedules"("created_by_id");

-- CreateIndex
CREATE INDEX "patrols_user_id_idx" ON "patrols"("user_id");

-- CreateIndex
CREATE INDEX "patrols_site_id_idx" ON "patrols"("site_id");

-- CreateIndex
CREATE INDEX "patrols_patrol_point_id_idx" ON "patrols"("patrol_point_id");

-- CreateIndex
CREATE INDEX "patrols_schedule_assignment_id_idx" ON "patrols"("schedule_assignment_id");

-- CreateIndex
CREATE INDEX "patrols_checkpoint_id_idx" ON "patrols"("checkpoint_id");

-- CreateIndex
CREATE INDEX "question_options_question_id_idx" ON "question_options"("question_id");

-- CreateIndex
CREATE INDEX "sites_created_by_id_idx" ON "sites"("created_by_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_point_nfc" ADD CONSTRAINT "patrol_point_nfc_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_assignments" ADD CONSTRAINT "patrol_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_questions" ADD CONSTRAINT "point_questions_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_questions" ADD CONSTRAINT "point_questions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_dates" ADD CONSTRAINT "patrol_schedule_dates_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "patrol_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_dates" ADD CONSTRAINT "patrol_schedule_dates_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_assignments" ADD CONSTRAINT "patrol_schedule_assignments_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "patrol_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_assignments" ADD CONSTRAINT "patrol_schedule_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_assignments" ADD CONSTRAINT "patrol_schedule_assignments_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_schedule_date_id_fkey" FOREIGN KEY ("schedule_date_id") REFERENCES "patrol_schedule_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_rounds" ADD CONSTRAINT "patrol_rounds_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_round_id_fkey" FOREIGN KEY ("round_id") REFERENCES "patrol_rounds"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_checkpoints" ADD CONSTRAINT "patrol_checkpoints_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_schedule_assignment_id_fkey" FOREIGN KEY ("schedule_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "patrol_checkpoints"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_patrolAssignmentId_fkey" FOREIGN KEY ("patrolAssignmentId") REFERENCES "patrol_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;
