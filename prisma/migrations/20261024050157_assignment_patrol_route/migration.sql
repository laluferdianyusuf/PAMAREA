-- CreateTable
CREATE TABLE "patrol_schedule_assignment_points" (
    "id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL,
    "required" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "patrol_schedule_assignment_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "patrol_schedule_assignment_points_assignment_id_sequence_idx" ON "patrol_schedule_assignment_points"("assignment_id", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_schedule_assignment_points_assignment_id_patrol_poin_key" ON "patrol_schedule_assignment_points"("assignment_id", "patrol_point_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_schedule_assignment_points_assignment_id_sequence_key" ON "patrol_schedule_assignment_points"("assignment_id", "sequence");

-- AddForeignKey
ALTER TABLE "patrol_schedule_assignment_points" ADD CONSTRAINT "patrol_schedule_assignment_points_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "patrol_schedule_assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_assignment_points" ADD CONSTRAINT "patrol_schedule_assignment_points_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
