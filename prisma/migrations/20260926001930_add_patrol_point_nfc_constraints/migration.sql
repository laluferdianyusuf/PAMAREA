-- CreateIndex
CREATE INDEX "patrol_point_nfc_unassigned_at_idx" ON "patrol_point_nfc"("unassigned_at");

CREATE UNIQUE INDEX "uq_patrol_point_nfc_active_point"
ON "patrol_point_nfc" ("patrol_point_id")
WHERE "status" = 'ACTIVE';

CREATE UNIQUE INDEX "uq_patrol_point_nfc_active_nfc"
ON "patrol_point_nfc" ("nfc_tag_id")
WHERE "status" = 'ACTIVE';