-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('ADMIN', 'SECURITY');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "SiteStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'BLOCKED');

-- CreateEnum
CREATE TYPE "PatrolPointStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NfcStatus" AS ENUM ('UNASSIGNED', 'ACTIVE', 'DAMAGED', 'LOST', 'REPLACED', 'INACTIVE');

-- CreateEnum
CREATE TYPE "NfcAssignmentStatus" AS ENUM ('ACTIVE', 'REPLACED', 'REMOVED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('YES_NO', 'SINGLE_CHOICE', 'TEXT');

-- CreateEnum
CREATE TYPE "PhotoRequirement" AS ENUM ('NONE', 'REQUIRED', 'CONDITIONAL');

-- CreateEnum
CREATE TYPE "QuestionStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PatrolStatus" AS ENUM ('STARTED', 'VALIDATED', 'IN_PROGRESS', 'SUBMITTED', 'FAILED');

-- CreateEnum
CREATE TYPE "GpsValidationStatus" AS ENUM ('VALID', 'INVALID', 'UNAVAILABLE');

-- CreateEnum
CREATE TYPE "NfcValidationStatus" AS ENUM ('VALID', 'BYPASSED', 'FAILED');

-- CreateEnum
CREATE TYPE "NfcBypassReason" AS ENUM ('DAMAGED', 'NOT_READABLE', 'LOST', 'DEVICE_ISSUE', 'OTHER');

-- CreateEnum
CREATE TYPE "FindingSeverity" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- CreateEnum
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

-- CreateTable
CREATE TABLE "roles" (
    "id" UUID NOT NULL,
    "name" "RoleName" NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sites" (
    "id" UUID NOT NULL,
    "created_by_id" UUID,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "address" TEXT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "status" "SiteStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "role_id" UUID NOT NULL,
    "site_id" UUID,
    "created_by_id" UUID,
    "employee_number" VARCHAR(50),
    "full_name" VARCHAR(150) NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "email" VARCHAR(150),
    "phone" VARCHAR(30),
    "password_hash" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "deleted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_devices" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "device_identifier" VARCHAR(255) NOT NULL,
    "platform" VARCHAR(20) NOT NULL,
    "model" VARCHAR(100),
    "os_version" VARCHAR(50),
    "app_version" VARCHAR(50),
    "status" "DeviceStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_seen_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_points" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "description" TEXT,
    "latitude" DECIMAL(10,7) NOT NULL,
    "longitude" DECIMAL(10,7) NOT NULL,
    "radius_meters" INTEGER NOT NULL DEFAULT 30,
    "status" "PatrolPointStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "deleted_at" TIMESTAMP(3),

    CONSTRAINT "patrol_points_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "nfc_tags" (
    "id" UUID NOT NULL,
    "uid" VARCHAR(255) NOT NULL,
    "label" VARCHAR(100),
    "status" "NfcStatus" NOT NULL DEFAULT 'UNASSIGNED',
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "nfc_tags_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_point_nfc" (
    "id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "nfc_tag_id" UUID NOT NULL,
    "assigned_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "unassigned_at" TIMESTAMP(3),
    "status" "NfcAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "reason" TEXT,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_point_nfc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_assignments" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questions" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "question_text" TEXT NOT NULL,
    "question_type" "QuestionType" NOT NULL,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "photo_requirement" "PhotoRequirement" NOT NULL DEFAULT 'NONE',
    "status" "QuestionStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "question_options" (
    "id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "value" VARCHAR(100) NOT NULL,
    "label" VARCHAR(150) NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "question_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "point_questions" (
    "id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "is_required" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "point_questions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrols" (
    "id" UUID NOT NULL,
    "report_number" VARCHAR(50) NOT NULL,
    "user_id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "device_id" UUID,
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "gps_accuracy" DECIMAL(8,2),
    "distance_from_point" DECIMAL(10,2),
    "gps_validation_status" "GpsValidationStatus" NOT NULL DEFAULT 'UNAVAILABLE',
    "nfc_tag_id" UUID,
    "nfc_uid_snapshot" VARCHAR(255),
    "nfc_validation_status" "NfcValidationStatus" NOT NULL DEFAULT 'FAILED',
    "nfc_bypass" BOOLEAN NOT NULL DEFAULT false,
    "nfc_bypass_reason" "NfcBypassReason",
    "nfc_bypass_note" TEXT,
    "status" "PatrolStatus" NOT NULL DEFAULT 'STARTED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrols_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_answers" (
    "id" UUID NOT NULL,
    "patrol_id" UUID NOT NULL,
    "question_id" UUID NOT NULL,
    "question_text_snapshot" TEXT NOT NULL,
    "answer_value" TEXT,
    "answer_label_snapshot" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_photos" (
    "id" UUID NOT NULL,
    "patrol_id" UUID NOT NULL,
    "answer_id" UUID,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "file_size" BIGINT,
    "latitude" DECIMAL(10,7),
    "longitude" DECIMAL(10,7),
    "captured_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "findings" (
    "id" UUID NOT NULL,
    "patrol_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "reported_by" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" TEXT NOT NULL,
    "severity" "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "assigned_to" UUID,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "finding_photos" (
    "id" UUID NOT NULL,
    "finding_id" UUID NOT NULL,
    "file_url" TEXT NOT NULL,
    "file_name" VARCHAR(255),
    "mime_type" VARCHAR(100),
    "file_size" BIGINT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "finding_photos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "action" VARCHAR(100) NOT NULL,
    "entity_type" VARCHAR(100) NOT NULL,
    "entity_id" UUID,
    "old_data" JSONB,
    "new_data" JSONB,
    "ip_address" INET,
    "user_agent" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_schedules" (
    "id" UUID NOT NULL,
    "site_id" UUID NOT NULL,
    "name" VARCHAR(150) NOT NULL,
    "start_time" VARCHAR(5) NOT NULL,
    "end_time" VARCHAR(5) NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "patrol_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patrol_schedule_points" (
    "id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "patrol_point_id" UUID NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "required" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patrol_schedule_points_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "roles_name_key" ON "roles"("name");

-- CreateIndex
CREATE UNIQUE INDEX "sites_code_key" ON "sites"("code");

-- CreateIndex
CREATE INDEX "sites_name_idx" ON "sites"("name");

-- CreateIndex
CREATE INDEX "sites_status_idx" ON "sites"("status");

-- CreateIndex
CREATE UNIQUE INDEX "users_employee_number_key" ON "users"("employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_role_id_idx" ON "users"("role_id");

-- CreateIndex
CREATE INDEX "users_site_id_idx" ON "users"("site_id");

-- CreateIndex
CREATE INDEX "users_created_by_id_idx" ON "users"("created_by_id");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "users_deleted_at_idx" ON "users"("deleted_at");

-- CreateIndex
CREATE INDEX "users_full_name_idx" ON "users"("full_name");

-- CreateIndex
CREATE UNIQUE INDEX "user_devices_device_identifier_key" ON "user_devices"("device_identifier");

-- CreateIndex
CREATE INDEX "user_devices_user_id_idx" ON "user_devices"("user_id");

-- CreateIndex
CREATE INDEX "user_devices_status_idx" ON "user_devices"("status");

-- CreateIndex
CREATE INDEX "patrol_points_site_id_idx" ON "patrol_points"("site_id");

-- CreateIndex
CREATE INDEX "patrol_points_status_idx" ON "patrol_points"("status");

-- CreateIndex
CREATE INDEX "patrol_points_name_idx" ON "patrol_points"("name");

-- CreateIndex
CREATE INDEX "patrol_points_deleted_at_idx" ON "patrol_points"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_points_site_id_code_key" ON "patrol_points"("site_id", "code");

-- CreateIndex
CREATE UNIQUE INDEX "nfc_tags_uid_key" ON "nfc_tags"("uid");

-- CreateIndex
CREATE INDEX "nfc_tags_status_idx" ON "nfc_tags"("status");

-- CreateIndex
CREATE INDEX "patrol_point_nfc_patrol_point_id_status_idx" ON "patrol_point_nfc"("patrol_point_id", "status");

-- CreateIndex
CREATE INDEX "patrol_point_nfc_nfc_tag_id_status_idx" ON "patrol_point_nfc"("nfc_tag_id", "status");

-- CreateIndex
CREATE INDEX "patrol_point_nfc_assigned_at_idx" ON "patrol_point_nfc"("assigned_at");

-- CreateIndex
CREATE INDEX "patrol_assignments_user_id_status_idx" ON "patrol_assignments"("user_id", "status");

-- CreateIndex
CREATE INDEX "patrol_assignments_patrol_point_id_status_idx" ON "patrol_assignments"("patrol_point_id", "status");

-- CreateIndex
CREATE INDEX "patrol_assignments_start_date_idx" ON "patrol_assignments"("start_date");

-- CreateIndex
CREATE INDEX "patrol_assignments_end_date_idx" ON "patrol_assignments"("end_date");

-- CreateIndex
CREATE UNIQUE INDEX "questions_code_key" ON "questions"("code");

-- CreateIndex
CREATE INDEX "questions_question_type_idx" ON "questions"("question_type");

-- CreateIndex
CREATE INDEX "questions_status_idx" ON "questions"("status");

-- CreateIndex
CREATE INDEX "question_options_question_id_sort_order_idx" ON "question_options"("question_id", "sort_order");

-- CreateIndex
CREATE INDEX "point_questions_patrol_point_id_sort_order_idx" ON "point_questions"("patrol_point_id", "sort_order");

-- CreateIndex
CREATE INDEX "point_questions_question_id_idx" ON "point_questions"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "point_questions_patrol_point_id_question_id_key" ON "point_questions"("patrol_point_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrols_report_number_key" ON "patrols"("report_number");

-- CreateIndex
CREATE INDEX "patrols_user_id_started_at_idx" ON "patrols"("user_id", "started_at");

-- CreateIndex
CREATE INDEX "patrols_site_id_started_at_idx" ON "patrols"("site_id", "started_at");

-- CreateIndex
CREATE INDEX "patrols_patrol_point_id_started_at_idx" ON "patrols"("patrol_point_id", "started_at");

-- CreateIndex
CREATE INDEX "patrols_assignment_id_idx" ON "patrols"("assignment_id");

-- CreateIndex
CREATE INDEX "patrols_device_id_idx" ON "patrols"("device_id");

-- CreateIndex
CREATE INDEX "patrols_nfc_tag_id_idx" ON "patrols"("nfc_tag_id");

-- CreateIndex
CREATE INDEX "patrols_status_idx" ON "patrols"("status");

-- CreateIndex
CREATE INDEX "patrols_nfc_bypass_idx" ON "patrols"("nfc_bypass");

-- CreateIndex
CREATE INDEX "patrols_started_at_idx" ON "patrols"("started_at");

-- CreateIndex
CREATE INDEX "patrol_answers_patrol_id_idx" ON "patrol_answers"("patrol_id");

-- CreateIndex
CREATE INDEX "patrol_answers_question_id_idx" ON "patrol_answers"("question_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_answers_patrol_id_question_id_key" ON "patrol_answers"("patrol_id", "question_id");

-- CreateIndex
CREATE INDEX "patrol_photos_patrol_id_idx" ON "patrol_photos"("patrol_id");

-- CreateIndex
CREATE INDEX "patrol_photos_answer_id_idx" ON "patrol_photos"("answer_id");

-- CreateIndex
CREATE INDEX "patrol_photos_captured_at_idx" ON "patrol_photos"("captured_at");

-- CreateIndex
CREATE INDEX "findings_patrol_id_idx" ON "findings"("patrol_id");

-- CreateIndex
CREATE INDEX "findings_patrol_point_id_idx" ON "findings"("patrol_point_id");

-- CreateIndex
CREATE INDEX "findings_reported_by_idx" ON "findings"("reported_by");

-- CreateIndex
CREATE INDEX "findings_assigned_to_idx" ON "findings"("assigned_to");

-- CreateIndex
CREATE INDEX "findings_resolved_by_idx" ON "findings"("resolved_by");

-- CreateIndex
CREATE INDEX "findings_status_idx" ON "findings"("status");

-- CreateIndex
CREATE INDEX "findings_severity_idx" ON "findings"("severity");

-- CreateIndex
CREATE INDEX "findings_created_at_idx" ON "findings"("created_at");

-- CreateIndex
CREATE INDEX "finding_photos_finding_id_idx" ON "finding_photos"("finding_id");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_created_at_idx" ON "audit_logs"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_action_idx" ON "audit_logs"("action");

-- CreateIndex
CREATE INDEX "audit_logs_entity_type_entity_id_idx" ON "audit_logs"("entity_type", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_created_at_idx" ON "audit_logs"("created_at");

-- CreateIndex
CREATE INDEX "patrol_schedules_site_id_status_idx" ON "patrol_schedules"("site_id", "status");

-- CreateIndex
CREATE INDEX "patrol_schedule_points_schedule_id_sequence_idx" ON "patrol_schedule_points"("schedule_id", "sequence");

-- CreateIndex
CREATE INDEX "patrol_schedule_points_patrol_point_id_idx" ON "patrol_schedule_points"("patrol_point_id");

-- CreateIndex
CREATE UNIQUE INDEX "patrol_schedule_points_schedule_id_patrol_point_id_key" ON "patrol_schedule_points"("schedule_id", "patrol_point_id");

-- AddForeignKey
ALTER TABLE "sites" ADD CONSTRAINT "sites_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_id_fkey" FOREIGN KEY ("role_id") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_devices" ADD CONSTRAINT "user_devices_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_points" ADD CONSTRAINT "patrol_points_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "nfc_tags" ADD CONSTRAINT "nfc_tags_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_point_nfc" ADD CONSTRAINT "patrol_point_nfc_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_point_nfc" ADD CONSTRAINT "patrol_point_nfc_nfc_tag_id_fkey" FOREIGN KEY ("nfc_tag_id") REFERENCES "nfc_tags"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_point_nfc" ADD CONSTRAINT "patrol_point_nfc_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_assignments" ADD CONSTRAINT "patrol_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_assignments" ADD CONSTRAINT "patrol_assignments_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_assignments" ADD CONSTRAINT "patrol_assignments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questions" ADD CONSTRAINT "questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "question_options" ADD CONSTRAINT "question_options_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_questions" ADD CONSTRAINT "point_questions_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_questions" ADD CONSTRAINT "point_questions_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "point_questions" ADD CONSTRAINT "point_questions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_assignment_id_fkey" FOREIGN KEY ("assignment_id") REFERENCES "patrol_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_device_id_fkey" FOREIGN KEY ("device_id") REFERENCES "user_devices"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrols" ADD CONSTRAINT "patrols_nfc_tag_id_fkey" FOREIGN KEY ("nfc_tag_id") REFERENCES "nfc_tags"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_answers" ADD CONSTRAINT "patrol_answers_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_answers" ADD CONSTRAINT "patrol_answers_question_id_fkey" FOREIGN KEY ("question_id") REFERENCES "questions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_photos" ADD CONSTRAINT "patrol_photos_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_photos" ADD CONSTRAINT "patrol_photos_answer_id_fkey" FOREIGN KEY ("answer_id") REFERENCES "patrol_answers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_patrol_id_fkey" FOREIGN KEY ("patrol_id") REFERENCES "patrols"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_reported_by_fkey" FOREIGN KEY ("reported_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_assigned_to_fkey" FOREIGN KEY ("assigned_to") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "findings" ADD CONSTRAINT "findings_resolved_by_fkey" FOREIGN KEY ("resolved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "finding_photos" ADD CONSTRAINT "finding_photos_finding_id_fkey" FOREIGN KEY ("finding_id") REFERENCES "findings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_site_id_fkey" FOREIGN KEY ("site_id") REFERENCES "sites"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedules" ADD CONSTRAINT "patrol_schedules_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_points" ADD CONSTRAINT "patrol_schedule_points_schedule_id_fkey" FOREIGN KEY ("schedule_id") REFERENCES "patrol_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "patrol_schedule_points" ADD CONSTRAINT "patrol_schedule_points_patrol_point_id_fkey" FOREIGN KEY ("patrol_point_id") REFERENCES "patrol_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
