-- CreateTable for model metrics aggregation
CREATE TABLE "model_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "model_id" UUID NOT NULL,
    "window" TEXT NOT NULL,
    "success_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "correction_rate" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "avg_confidence" DECIMAL(5,4) NOT NULL DEFAULT 0,
    "mean_time_to_fix_ms" INTEGER NOT NULL DEFAULT 0,
    "cost_per_run" DECIMAL(10,6) NOT NULL DEFAULT 0,
    "total_runs" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT "model_metrics_pkey" PRIMARY KEY ("id")
);

-- Add training consent column to users
ALTER TABLE "users" ADD COLUMN "allow_training" BOOLEAN NOT NULL DEFAULT false;

-- Add indexes for efficient querying
CREATE INDEX "model_metrics_model_id_window_idx" ON "model_metrics"("model_id", "window");
CREATE INDEX "model_metrics_created_at_idx" ON "model_metrics"("created_at");

-- Add foreign key constraint
ALTER TABLE "model_metrics" ADD CONSTRAINT "model_metrics_model_id_fkey" FOREIGN KEY ("model_id") REFERENCES "models"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add unique constraint to prevent duplicate metrics for same model/window
CREATE UNIQUE INDEX "model_metrics_model_window_date_idx" ON "model_metrics"("model_id", "window", DATE("created_at"));

-- Add check constraints for valid percentages
ALTER TABLE "model_metrics" ADD CONSTRAINT "model_metrics_success_rate_check" CHECK ("success_rate" >= 0 AND "success_rate" <= 1);
ALTER TABLE "model_metrics" ADD CONSTRAINT "model_metrics_correction_rate_check" CHECK ("correction_rate" >= 0 AND "correction_rate" <= 1);
ALTER TABLE "model_metrics" ADD CONSTRAINT "model_metrics_avg_confidence_check" CHECK ("avg_confidence" >= 0 AND "avg_confidence" <= 1);