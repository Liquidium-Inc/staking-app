-- Remove the isActive column from email_subscriptions table
-- We're switching to immediate deletion instead of soft deletion for better GDPR compliance

-- First drop the index that uses the isActive column
DROP INDEX IF EXISTS idx_email_subscriptions_verified_active;

-- Then remove the isActive column
ALTER TABLE email_subscriptions DROP COLUMN IF EXISTS is_active;