-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "workspace_role" AS ENUM ('OWNER', 'ADMIN', 'MEMBER');

-- CreateEnum
CREATE TYPE "import_status" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "import_file_status" AS ENUM ('PENDING', 'VALIDATING', 'IMPORTING', 'COMPLETED', 'COMPLETED_WITH_ERRORS', 'FAILED');

-- CreateEnum
CREATE TYPE "file_storage_provider" AS ENUM ('SUPABASE_STORAGE', 'GOOGLE_DRIVE');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "full_name" VARCHAR(200),
    "phone_number" VARCHAR(40),
    "address_line_1" VARCHAR(200),
    "address_line_2" VARCHAR(200),
    "city" VARCHAR(120),
    "region" VARCHAR(120),
    "postal_code" VARCHAR(32),
    "country_code" CHAR(2),
    "avatar_url" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspaces" (
    "id" UUID NOT NULL,
    "name" VARCHAR(160) NOT NULL,
    "created_by_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "workspace_members" (
    "workspace_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" "workspace_role" NOT NULL DEFAULT 'MEMBER',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "workspace_members_pkey" PRIMARY KEY ("workspace_id","user_id")
);

-- CreateTable
CREATE TABLE "import_batches" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "created_by_id" UUID NOT NULL,
    "status" "import_status" NOT NULL DEFAULT 'QUEUED',
    "started_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "error_message" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_files" (
    "id" UUID NOT NULL,
    "import_batch_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "original_file_name" VARCHAR(255) NOT NULL,
    "storage_provider" "file_storage_provider" NOT NULL DEFAULT 'SUPABASE_STORAGE',
    "storage_path" TEXT,
    "google_drive_file_id" VARCHAR(255),
    "google_drive_folder_id" VARCHAR(255),
    "content_type" VARCHAR(160),
    "byte_size" BIGINT,
    "sha256" CHAR(64),
    "status" "import_file_status" NOT NULL DEFAULT 'PENDING',
    "total_rows" INTEGER,
    "imported_rows" INTEGER,
    "rejected_rows" INTEGER,
    "error_message" TEXT,
    "completed_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_issues" (
    "id" UUID NOT NULL,
    "import_file_id" UUID NOT NULL,
    "row_number" INTEGER,
    "column_name" VARCHAR(160),
    "issue_code" VARCHAR(80) NOT NULL,
    "message" TEXT NOT NULL,
    "raw_value" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "import_file_id" UUID,
    "source_row_number" INTEGER,
    "source_system" VARCHAR(64) NOT NULL DEFAULT 'eviivo',
    "internal_company" VARCHAR(80),
    "property_name" VARCHAR(200),
    "booking_date" DATE,
    "booking_reference" VARCHAR(128) NOT NULL,
    "order_reference" VARCHAR(128),
    "ota_reference" VARCHAR(128),
    "guest_name" VARCHAR(200),
    "guest_first_name" VARCHAR(120),
    "guest_last_name" VARCHAR(120),
    "arrival_date" DATE,
    "departure_date" DATE,
    "booking_status" VARCHAR(80),
    "total_amount" DECIMAL(10,2) NOT NULL,
    "paid_amount" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "room_unit_revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "other_revenue" DECIMAL(10,2),
    "deposit_amount" DECIMAL(10,2),
    "currency_code" CHAR(3),
    "source_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payments" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "booking_id" UUID,
    "import_file_id" UUID,
    "source_row_number" INTEGER,
    "source_system" VARCHAR(64) NOT NULL DEFAULT 'eviivo',
    "payment_id" VARCHAR(128) NOT NULL,
    "booking_reference" VARCHAR(128),
    "payment_reference" VARCHAR(128),
    "payment_date" TIMESTAMPTZ(6),
    "payment_method" VARCHAR(80),
    "payment_status" VARCHAR(80),
    "description" TEXT,
    "direct_1" DECIMAL(10,2) NOT NULL,
    "currency_code" CHAR(3),
    "source_data" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "actor_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" VARCHAR(128),
    "metadata" JSONB,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "workspaces_created_by_id_idx" ON "workspaces"("created_by_id");

-- CreateIndex
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members"("user_id");

-- CreateIndex
CREATE INDEX "import_batches_workspace_id_status_created_at_idx" ON "import_batches"("workspace_id", "status", "created_at");

-- CreateIndex
CREATE INDEX "import_batches_created_by_id_idx" ON "import_batches"("created_by_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_batches_id_workspace_id_key" ON "import_batches"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "import_files_import_batch_id_status_idx" ON "import_files"("import_batch_id", "status");

-- CreateIndex
CREATE INDEX "import_files_sha256_idx" ON "import_files"("sha256");

-- CreateIndex
CREATE INDEX "import_files_google_drive_file_id_idx" ON "import_files"("google_drive_file_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_files_id_workspace_id_key" ON "import_files"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "import_issues_import_file_id_row_number_idx" ON "import_issues"("import_file_id", "row_number");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_arrival_date_idx" ON "bookings"("workspace_id", "arrival_date");

-- CreateIndex
CREATE INDEX "bookings_workspace_id_booking_status_idx" ON "bookings"("workspace_id", "booking_status");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_workspace_id_source_system_booking_reference_key" ON "bookings"("workspace_id", "source_system", "booking_reference");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_import_file_id_source_row_number_key" ON "bookings"("import_file_id", "source_row_number");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_id_workspace_id_key" ON "bookings"("id", "workspace_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_payment_date_idx" ON "payments"("workspace_id", "payment_date");

-- CreateIndex
CREATE INDEX "payments_workspace_id_booking_id_idx" ON "payments"("workspace_id", "booking_id");

-- CreateIndex
CREATE INDEX "payments_workspace_id_payment_status_idx" ON "payments"("workspace_id", "payment_status");

-- CreateIndex
CREATE UNIQUE INDEX "payments_workspace_id_source_system_payment_id_key" ON "payments"("workspace_id", "source_system", "payment_id");

-- CreateIndex
CREATE UNIQUE INDEX "payments_import_file_id_source_row_number_key" ON "payments"("import_file_id", "source_row_number");

-- CreateIndex
CREATE INDEX "audit_logs_workspace_id_created_at_idx" ON "audit_logs"("workspace_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_actor_id_idx" ON "audit_logs"("actor_id");

-- AddForeignKey
ALTER TABLE "workspaces" ADD CONSTRAINT "workspaces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_batches" ADD CONSTRAINT "import_batches_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_import_batch_id_workspace_id_fkey" FOREIGN KEY ("import_batch_id", "workspace_id") REFERENCES "import_batches"("id", "workspace_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_issues" ADD CONSTRAINT "import_issues_import_file_id_fkey" FOREIGN KEY ("import_file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_import_file_id_workspace_id_fkey" FOREIGN KEY ("import_file_id", "workspace_id") REFERENCES "import_files"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_booking_id_workspace_id_fkey" FOREIGN KEY ("booking_id", "workspace_id") REFERENCES "bookings"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payments" ADD CONSTRAINT "payments_import_file_id_workspace_id_fkey" FOREIGN KEY ("import_file_id", "workspace_id") REFERENCES "import_files"("id", "workspace_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_fkey" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
