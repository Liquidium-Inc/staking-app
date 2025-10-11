# Liquidium Staking Protocol

A full-stack protocol for staking runes on Bitcoin, developed by Rather Labs and for the Liquidium Foundation.

---

## Overview

Liquidium Staking is a protocol that enables users to stake runes on Bitcoin, earning yield and participating in a decentralized staking pool. The project leverages Next.js (App Router), React, React Query, Drizzle ORM, PostgreSQL, and Redis (for distributed UTXO locks, not cache). It integrates with Internet Computer canisters for exchange rate data, mempool.space for Bitcoin blockchain data, Ordiscan and Best In Slot for rune market information, and the Liquidium internal API for rune-aware UTXO data. Transactional and digest email delivery is handled via Resend.

The core staking logic runs in the canister smart contract maintained at https://github.com/Liquidium-Inc/staking-canister/.

---

## Main Features

- **Stake/Unstake Runes**: Users can stake and unstake supported runes, receiving sLIQUIDIUM as a staking receipt.
- **Serverless Backend**: All backend logic runs on Next.js API routes (serverless functions).
- **Distributed UTXO Locking**: Uses Redis to coordinate UTXO usage and prevent ~~double-spending~~ double-assignation.
- **Blockchain Data**: Integrates with Internet Computer canisters for exchange rates, mempool.space for Bitcoin blockchain data, and Ordiscan/Best In Slot for rune information.
- **Email Notifications**: Provides opt-in staking email alerts and a weekly digest powered by the Resend API.
- **Portfolio & Analytics**: Users can view their staking portfolio, yields, and historical performance.

---

## Project Structure

- `src/app/` — Main Next.js app, including API routes and UI.
- `src/app/api/` — Serverless API endpoints (see below for details).
- `src/app/debug/` — Debugging and development tools (see below).
- `src/config/` — Runtime configuration derived from environment variables.
- `src/providers/` — Integrations with external APIs (Liquidium API, Ordiscan, Best In Slot, mempool, email, etc).
- `src/db/` — Database schema and Drizzle ORM setup.
- `public/` — Static assets and branding.
- `src/scripts/` — Utility scripts for PSBT decoding, rune helpers, and local integration testing.

---

## Environment Variables

Copy `.env.example` to `.env` and fill in the required values:

- `NEXT_PUBLIC_NETWORK` — Network to use (`mainnet` or `testnet4`).
- `DUST_AMOUNT` — Minimum output value in sats. Recommended to be 546.
- `DESIRED_UTXOS` — Limit for the protocol to bisect UTXOs when stakes or unstakes take place.
- `MEMPOOL_BALANCE` — Use mempool for balance calculations instead of relying on the Best In Slot balance endpoint (boolean).
- `MEMPOOL_HOST` — Mempool API host used for the backend.
- `NEXT_PUBLIC_MEMPOOL_URL` — Public mempool explorer URL. Used solely for the front-end.
- `DATABASE_URL` — PostgreSQL connection string.
- `REDIS_URL` — Redis connection string. Used for the assignation of the UTXOs.
- `CRON_SECRET` — Secret for securing cron endpoints.
- `ORACLE_PRIVATE_KEY` — Private key used to authorize canister exchange rate operations.
- `CANISTER_*` — Canister configuration (`CANISTER_ID`, `CANISTER_ADDRESS`, `CANISTER_PUBLIC_KEY`, `CANISTER_SECRET`, `RETENTION_ADDRESS`, `RETENTION_SECRET`, `CANISTER_MOCK`, etc).
- `BEST_IN_SLOT_URL` / `BEST_IN_SLOT_TOKEN` — Best In Slot API base URL and token for rune data.
- `ORDISCAN_API_URL` / `ORDISCAN_API_TOKEN` — Ordiscan API base URL and token for rune market data.
- `LIQUIDIUM_API_URL` / `LIQUIDIUM_API_TOKEN` — Liquidium internal API base URL and token for rune-aware UTXO data.
- `NEXT_PUBLIC_STAKED_*` — Metadata for the staked rune (`ID`, `NAME`, `SYMBOL`, `DECIMALS`, etc).
- `NEXT_PUBLIC_STAKED_SUPPLY` — Total supply of the staked rune. Used for computing the exchange rate.
- `NEXT_PUBLIC_TOKEN_*` — Metadata for the underlying rune (`ID`, `NAME`, `SYMBOL`, `DECIMALS`, etc).
- `NEXT_PUBLIC_EXPECTED_CONFIRMATIONS` — Number of confirmations required to consider a transaction completed.
- `NEXT_PUBLIC_WITHDRAW_TIME` — Withdrawal lock time when the user unstake (in seconds).
- `NEXT_PUBLIC_OVERWRITE_TOKEN_CONFIG` — Toggle for overriding on-chain token metadata with environment configuration.
- `NEXT_PUBLIC_DEBUG_TOKEN_PRICE` / `NEXT_PUBLIC_DEBUG_BTC_PRICE` — Optional debug overrides for UI previews.
- `RESEND_API_KEY` / `FROM_EMAIL` / `BASE_URL` — Resend credentials and default site URL for transactional and digest emails.
- `NEXT_PUBLIC_SITE_URL` — Public-facing site URL for canonical links and redirects.
- `NEXT_PUBLIC_POSTHOG_KEY` / `POSTHOG_API_KEY` / `POSTHOG_HOST` / `POSTHOG_SERVER_HOST` — PostHog analytics configuration.
- `GENERATE_SOURCEMAPS` — Enables source map generation and PostHog uploads during builds.

---

## API Endpoints

| Endpoint                 | Method   | Description                                                                             |
| ------------------------ | -------- | --------------------------------------------------------------------------------------- |
| `/api/stake`             | POST     | Create a PSBT for staking runes (user must sign with their wallet)                      |
| `/api/unstake`           | POST     | Create a PSBT for unstaking and redeeming sLIQUIDIUM (user must sign with their wallet) |
| `/api/withdraw`          | POST     | Create a PSBT for withdrawing tokens after unstaking (user must sign with their wallet) |
| `/api/stake/confirm`     | POST     | Validate, send to canister, and broadcast the signed stake transaction                  |
| `/api/unstake/confirm`   | POST     | Validate, send to canister, and broadcast the signed unstake transaction                |
| `/api/withdraw/confirm`  | POST     | Validate, send to canister, and broadcast the signed withdrawal transaction             |
| `/api/protocol`          | GET      | Get protocol stats and configuration                                                    |
| `/api/account/balance`   | GET      | Get wallet balances for runes                                                           |
| `/api/account/txs`       | GET      | Get wallet transaction history                                                          |
| `/api/fee-rates`         | GET      | Get recommended fee rates from mempool.space with graceful fallbacks                    |
| `/api/stake/pending`     | GET      | List pending stake transactions                                                         |
| `/api/unstake/pending`   | GET      | List pending unstake transactions                                                       |
| `/api/email/subscribe`   | POST     | Subscribe a wallet address to staking digest emails                                     |
| `/api/email/status`      | GET      | Check the subscription status for an address                                            |
| `/api/email/unsubscribe` | GET/POST | Remove an address from staking digest emails                                            |
| `/api/email/verify`      | GET      | Verify an email subscription token (redirects with status)                              |
| `/api/cron/*`            | GET      | Internal cron endpoints (require secret)                                                |

> Endpoints `/stake`, `/unstake`, and `/withdraw` only create the PSBT that the user must sign with their wallet. The corresponding `/confirm` endpoints validate the signed transaction, interact with the canister, and broadcast it to the Bitcoin network.

---

## Cron Jobs

### [Exchange Rate Oracle](src/app/api/cron/exchange_rate_pusher/route.ts)

This is the most critical cron job in the system because it maintains the exchange rate between the staked tokens and the underlying tokens based on the pool balances.

It retrieves the current exchange rate by calling `canister.getExchangeRate()` which provides:

- Circulating supply from the canister
- Current balance from the canister
- Block height from mempool.space API

The job calculates the staked balance (total supply - circulating) and stores the pool balances in the database for historical tracking and yield calculations.

This job is crucial because it:

- Ensures accurate conversion rates between staked and unstaked tokens
- Maintains the protocol's economic model
- Provides data for yield calculations
- Uses reliable data sources (canister + mempool.space)

### [Stake](src/app/api/cron/monitor/stake/route.ts)/[Unstake](src/app/api/cron/monitor/unstake/route.ts)/[Withdraw](src/app/api/cron/monitor/withdraw/route.ts) monitor

This cron job is responsible for monitoring the status of stake, unstake, and withdraw transactions. It checks the status of the transactions in the blockchain and updates the status in the database.

It also checks if the transactions are confirmed and if they are, it updates the status in the database.

### [Token holders](src/app/api/cron/token_holders/route.ts)

This cron job is responsible for fetching the token holders of the staked rune and storing them in the database. This is only used for analytics and preserving the data for future reference.

### [Weekly email digest](src/app/api/cron/weekly-email/route.ts)

Generates and sends a weekly staking digest email to subscribed addresses. It aggregates balances, recent activity, APY snapshots, and rune market data (via Ordiscan with Best In Slot fallback) before delivering through the Resend provider.

---

## Debug Tools (`src/app/debug/`)

This folder contains several pages and utilities for development and protocol debugging:

- `portfolio/` — Simulate and visualize staking portfolio and yield scenarios.
- `utxos/` — Visualize and debug UTXO distribution and assignment.
- `etcher/` — Test rune etching (minting) flows.
- `minter/` — Test rune minting flows.
- `signer/` — Test wallet signing flows.

These tools are not intended for production use, but are for protocol development and testing.

---

## Getting Started

Prerequisites:

- Node.js 20 (LTS) or newer
- npm 10+

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and configure your environment variables.
3. Run the development server:
   ```bash
   npm run dev
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Deployment

The project is configured for deployment on Vercel. Push to the main branch and Vercel will auto-deploy.

---

## Contributing

We welcome community contributions! Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on development workflows, coding standards, and how to propose changes. All participants are expected to follow our [Code of Conduct](./CODE_OF_CONDUCT.md).

## Security

If you discover a vulnerability, please follow the guidelines in [SECURITY.md](./SECURITY.md) to report it responsibly. Do not open public issues for security-sensitive reports.

## License

Distributed under the [GNU GPL v3.0](./LICENSE).

---

## Credits

Developed by Liquidium Foundation in collaboration with Rather Labs.
