CREATE TABLE IF NOT EXISTS wallet_auth_nonces (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    nonce VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_sessions (
    id SERIAL PRIMARY KEY,
    address VARCHAR(255) NOT NULL,
    token_hash TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    last_active_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS wallet_sessions_address_idx ON wallet_sessions (address);
CREATE INDEX IF NOT EXISTS wallet_sessions_expires_at_idx ON wallet_sessions (expires_at);
CREATE INDEX IF NOT EXISTS wallet_auth_nonces_expires_at_idx ON wallet_auth_nonces (expires_at);
