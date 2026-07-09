-- Add plan_type column to plans table
ALTER TABLE plans ADD COLUMN plan_type text DEFAULT null;
