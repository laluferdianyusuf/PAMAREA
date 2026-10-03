-- DropForeignKey
ALTER TABLE "sites" DROP CONSTRAINT "sites_created_by_id_fkey";

-- AlterTable
ALTER TABLE "sites" ALTER COLUMN "created_by_id" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
