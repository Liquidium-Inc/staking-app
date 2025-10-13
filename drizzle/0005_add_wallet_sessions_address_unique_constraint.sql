-- Drop the existing non-unique index
DROP INDEX IF EXISTS wallet_sessions_address_idx;

-- Add unique index on address column
CREATE UNIQUE INDEX IF NOT EXISTS wallet_sessions_address_unique ON wallet_sessions (address);

