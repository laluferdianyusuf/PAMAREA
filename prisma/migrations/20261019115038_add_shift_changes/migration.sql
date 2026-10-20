-- CreateEnum
CREATE TYPE "ShiftChangeStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- AlterTable
ALTER TABLE "patrol_points" ALTER COLUMN "status" SET DEFAULT 'INACTIVE';

-- CreateTable
CREATE TABLE "shift_changes" (
    "id" UUID NOT NULL,
    "first_assignment_id" UUID NOT NULL,
    "second_assignment_id" UUID NOT NULL,
    "effective_date" DATE NOT NULL,
    "effective_at" TIMESTAMPTZ(3),
    "reason" VARCHAR(500),
    "status" "ShiftChangeStatus" NOT NULL DEFAULT 'PENDING',
    "requested_by_id" UUID NOT NULL,
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "rejected_at" TIMESTAMPTZ(3),
    "cancelled_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "shift_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "shift_changes_effective_date_status_idx" ON "shift_changes"("effective_date", "status");

-- CreateIndex
CREATE INDEX "shift_changes_first_assignment_id_effective_date_idx" ON "shift_changes"("first_assignment_id", "effective_date");

-- CreateIndex
CREATE INDEX "shift_changes_second_assignment_id_effective_date_idx" ON "shift_changes"("second_assignment_id", "effective_date");

-- AddForeignKey
ALTER TABLE "shift_changes" ADD CONSTRAINT "shift_changes_first_assignment_id_fkey" FOREIGN KEY ("first_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_changes" ADD CONSTRAINT "shift_changes_second_assignment_id_fkey" FOREIGN KEY ("second_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
