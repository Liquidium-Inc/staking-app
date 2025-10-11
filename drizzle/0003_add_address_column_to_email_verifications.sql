-- Add address column to email_verifications table
ALTER TABLE email_verifications ADD COLUMN IF NOT EXISTS address varchar(255);