-- Hapus unique index lama jika ada
DROP INDEX IF EXISTS "patrol_points_site_id_code_key";

-- Buat unique index hanya untuk checkpoint yang belum dihapus
CREATE UNIQUE INDEX "patrol_points_site_id_code_active_key"
ON "patrol_points" ("site_id", "code")
WHERE "deleted_at" IS NULL;