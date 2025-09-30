-- Add plan column to users table
ALTER TABLE "users" ADD COLUMN "plan" TEXT NOT NULL DEFAULT 'trial';

-- Create usage_counters table
CREATE TABLE "usage_counters" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "user_id" UUID NOT NULL,
    "period" TEXT NOT NULL,
    "prompts" INTEGER NOT NULL DEFAULT 0,
    "e2e_runs" INTEGER NOT NULL DEFAULT 0,
    "bytes_out" BIGINT NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT "usage_counters_pkey" PRIMARY KEY ("id")
);

-- Create unique constraint for user_id and period
CREATE UNIQUE INDEX "usage_counters_user_id_period_key" ON "usage_counters"("user_id", "period");

-- Add foreign key constraint
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Create indexes for efficient queries
CREATE INDEX "usage_counters_user_id_idx" ON "usage_counters"("user_id");
CREATE INDEX "usage_counters_period_idx" ON "usage_counters"("period");
CREATE INDEX "usage_counters_created_at_idx" ON "usage_counters"("created_at");

-- Add check constraints for plan values
ALTER TABLE "users" ADD CONSTRAINT "users_plan_check" CHECK ("plan" IN ('trial', 'solo', 'teams'));

-- Add check constraints for usage counters
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_prompts_check" CHECK ("prompts" >= 0);
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_e2e_runs_check" CHECK ("e2e_runs" >= 0);
ALTER TABLE "usage_counters" ADD CONSTRAINT "usage_counters_bytes_out_check" CHECK ("bytes_out" >= 0);