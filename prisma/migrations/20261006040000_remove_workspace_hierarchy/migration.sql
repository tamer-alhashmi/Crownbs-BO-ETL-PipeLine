-- DropForeignKey
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_import_file_id_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "bookings" DROP CONSTRAINT "bookings_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_created_by_id_fkey";

-- DropForeignKey
ALTER TABLE "import_batches" DROP CONSTRAINT "import_batches_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "import_files" DROP CONSTRAINT "import_files_import_batch_id_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_booking_id_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_import_file_id_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "payments" DROP CONSTRAINT "payments_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_user_id_fkey";

-- DropForeignKey
ALTER TABLE "workspace_members" DROP CONSTRAINT "workspace_members_workspace_id_fkey";

-- DropForeignKey
ALTER TABLE "workspaces" DROP CONSTRAINT "workspaces_created_by_id_fkey";

-- DropIndex
DROP INDEX "audit_logs_workspace_id_created_at_idx";

-- DropIndex
DROP INDEX "bookings_id_workspace_id_key";

-- DropIndex
DROP INDEX "bookings_workspace_id_arrival_date_idx";

-- DropIndex
DROP INDEX "bookings_workspace_id_booking_status_idx";

-- DropIndex
DROP INDEX "bookings_workspace_id_source_system_booking_reference_key";

-- DropIndex
DROP INDEX "import_batches_id_workspace_id_key";

-- DropIndex
DROP INDEX "import_batches_workspace_id_status_created_at_idx";

-- DropIndex
DROP INDEX "import_files_id_workspace_id_key";

-- DropIndex
DROP INDEX "payments_workspace_id_booking_id_idx";

-- DropIndex
DROP INDEX "payments_workspace_id_payment_date_idx";

-- DropIndex
DROP INDEX "payments_workspace_id_payment_status_idx";

-- DropIndex
DROP INDEX "payments_workspace_id_source_system_payment_id_key";

-- AlterTable
ALTER TABLE "audit_logs" DROP COLUMN "workspace_id";

-- AlterTable
ALTER TABLE "bookings" DROP COLUMN "workspace_id";

-- AlterTable
ALTER TABLE "import_batches" DROP COLUMN "workspace_id";

-- AlterTable
ALTER TABLE "import_files" DROP COLUMN "workspace_id";

-- AlterTable
ALTER TABLE "payments" DROP COLUMN "workspace_id";

-- DropTable
DROP TABLE "workspace_members";

-- DropTable
DROP TABLE "workspaces";

-- DropEnum
DROP TYPE "workspace_role";

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "bookings_arrival_date_idx" ON "bookings"("arrival_date");

-- CreateIndex
CREATE INDEX "bookings_booking_status_idx" ON "bookings"("booking_status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_source_system_booking_reference_key" ON "bookings"("source_system", "booking_reference");

-- CreateIndex
CREATE INDEX "payments_payment_date_idx" ON "payments"("payment_date");

-- CreateIndex
CREATE INDEX "payments_booking_id_idx" ON "payments"("booking_id");

-- CreateIndex
CREATE INDEX "payments_payment_status_idx" ON "payments"("payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_source_system_payment_id_key" ON "payments"("source_system", "payment_id");

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_import_batch_id_fkey" FOREIGN KEY ("import_batch_id") REFERENCES "import_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

