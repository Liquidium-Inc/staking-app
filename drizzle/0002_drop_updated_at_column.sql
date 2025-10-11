-- Drop the updated_at column from email_subscriptions table
ALTER TABLE email_subscriptions DROP COLUMN IF EXISTS updated_at;