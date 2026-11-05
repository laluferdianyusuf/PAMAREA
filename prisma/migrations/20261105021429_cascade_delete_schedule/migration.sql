-- DropForeignKey
ALTER TABLE "patrols" DROP CONSTRAINT "patrols_checkpoint_id_fkey";

-- DropForeignKey
ALTER TABLE "patrols" DROP CONSTRAINT "patrols_schedule_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "schedule_replacements" DROP CONSTRAINT "schedule_replacements_original_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "schedule_replacements" DROP CONSTRAINT "schedule_replacements_replacement_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_changes" DROP CONSTRAINT "shift_changes_first_assignment_id_fkey";

-- DropForeignKey
ALTER TABLE "shift_changes" DROP CONSTRAINT "shift_changes_second_assignment_id_fkey";

-- AddForeignKey
ALTER TABLE "shift_changes" ADD CONSTRAINT "shift_changes_first_assignment_id_fkey" FOREIGN KEY ("first_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_changes" ADD CONSTRAINT "shift_changes_second_assignment_id_fkey" FOREIGN KEY ("second_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_original_assignment_id_fkey" FOREIGN KEY ("original_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_replacements" ADD CONSTRAINT "schedule_replacements_replacement_assignment_id_fkey" FOREIGN KEY ("replacement_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_schedule_assignment_id_fkey" FOREIGN KEY ("schedule_assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_checkpoint_id_fkey" FOREIGN KEY ("checkpoint_id") REFERENCES "patrol_checkpoints"("id") ON DELETE CASCADE ON UPDATE CASCADE;
