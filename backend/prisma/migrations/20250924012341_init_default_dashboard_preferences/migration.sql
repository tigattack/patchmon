-- Create dashboard_preferences table
-- This migration only creates the table structure without populating preferences
-- Dashboard preferences will be initialized dynamically by server.js when users first access the dashboard

-- Create the dashboard_preferences table
CREATE TABLE IF NOT EXISTS "dashboard_preferences" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "card_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dashboard_preferences_pkey" PRIMARY KEY ("id")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "dashboard_preferences_user_id_idx" ON "dashboard_preferences"("user_id");
CREATE INDEX IF NOT EXISTS "dashboard_preferences_card_id_idx" ON "dashboard_preferences"("card_id");
CREATE INDEX IF NOT EXISTS "dashboard_preferences_user_card_idx" ON "dashboard_preferences"("user_id", "card_id");

-- Add foreign key constraint
ALTER TABLE "dashboard_preferences" ADD CONSTRAINT "dashboard_preferences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;