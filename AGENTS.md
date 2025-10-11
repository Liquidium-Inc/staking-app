## Development Commands

```bash
# Development
npm run dev              # Start development server with Turbopack
npm run build           # Build for production
npm start               # Start production server

# Code Quality
npm run lint            # Run ESLint
npm run format          # Format code with Prettier

# Testing
npm test                # Run Vitest tests (both Node.js and browser environments)

# Database
npx drizzle-kit generate # Generate database migrations
npx drizzle-kit migrate  # Run database migrations
npx drizzle-kit studio   # Open Drizzle Studio for database management
```

## Project Architecture

This is a **Bitcoin rune staking protocol** built with Next.js 15 (App Router). Users stake runes to earn yield and receive sLIQUIDIUM tokens as staking receipts.

### Key Technical Stack

- **Framework**: Next.js 15 with App Router, React 19, TypeScript 5
- **Database**: PostgreSQL with Drizzle ORM
- **Caching/Coordination**: Redis for distributed UTXO locking (not caching)
- **Bitcoin Integration**: bitcoinjs-lib, runelib, @magiceden-oss/runestone-lib
- **Wallet Integration**: @omnisat/lasereyes, sats-connect
- **State Management**: TanStack Query (React Query)
- **Testing**: Vitest with dual environments (Node.js and jsdom)

### Core Architecture Patterns

**Two-Phase Transaction Pattern**: All staking operations follow a pattern where:

1. Initial endpoint (`/api/stake`, `/api/unstake`, `/api/withdraw`) creates PSBT for user signing
2. Confirmation endpoint (`/api/*/confirm`) validates signed transaction, interacts with canister, and broadcasts

**Distributed UTXO Management**: Redis-based locking system prevents double-assignation of UTXOs across concurrent transactions. UTXOs are locked during transaction creation and released upon completion or timeout.

**Serverless API Design**: All backend logic runs on Next.js API routes (serverless functions), with external integrations to mempool.space, Ordiscan (primary), and Best In Slot (fallback) APIs.

### Critical System Components

**Exchange Rate Oracle** (`/api/cron/exchange_rate_pusher`): Most critical cron job that maintains exchange rates between staked and underlying tokens based on pool balances. This ensures accurate conversion rates and maintains the protocol's economic model.

**Transaction Monitors** (`/api/cron/monitor/*`): Monitor blockchain status of stake/unstake/withdraw transactions and update database accordingly.

**Canister Integration**: Internet Computer integration for protocol state management using @dfinity packages.

### Directory Structure

```
src/
├── app/
│   ├── (stake)/           # Main app routes (stake, unstake, portfolio)
│   ├── api/               # Serverless API endpoints
│   │   ├── stake/         # Staking operations
│   │   ├── unstake/       # Unstaking operations
│   │   ├── withdraw/      # Withdrawal operations
│   │   ├── cron/          # Background monitoring jobs
│   │   └── protocol/      # Protocol statistics
│   └── debug/             # Development tools (not for production)
├── components/
│   ├── ui/                # Reusable UI components (Radix-based)
│   ├── layout/            # Layout components
│   └── wallet/            # Wallet integration components
├── hooks/api/             # React Query hooks for API calls
├── providers/             # External service integrations (mempool, Ordiscan, Best In Slot)
├── db/                    # Drizzle ORM schema and database layer
├── services/              # Business logic services
├── lib/                   # Utility functions
└── config/                # Configuration management with Zod validation
```

## Environment Configuration

Copy `.env.example` to `.env`. Key variables:

- `NEXT_PUBLIC_NETWORK`: `mainnet` or `testnet4`
- `DATABASE_URL`: PostgreSQL connection
- `REDIS_URL`: Redis connection for UTXO coordination
- `BEST_IN_SLOT_URL` + `BEST_IN_SLOT_TOKEN`: Rune data API (fallback)
- `ORDISCAN_API_URL` + `ORDISCAN_API_TOKEN`: Primary rune price API
- `MEMPOOL_HOST`: Backend mempool API
- `CRON_SECRET`: Secures cron endpoints
- `ORACLE_PRIVATE_KEY`: Authorizes exchange rate updates
- `CANISTER_*`: Internet Computer canister configuration

## Testing Strategy

Vitest configuration supports dual environments:

- **Node.js environment**: `*.{spec,test}.ts` - API logic, services, utilities
- **Browser environment**: `*.{spec,test}.tsx` - React components, hooks

Test files should use appropriate extension based on environment needs.

### Test Execution (Agents)

- Always run Vitest in non-watch mode so the process exits automatically.
- Recommended command: `npm test -- --run --reporter=dot` (or `vitest run`).
- Do not start interactive watch mode that waits for keyboard input (e.g., press `q`).

## API Security & Validation

All API endpoints use Zod validation for request/response schemas. Cron endpoints require `CRON_SECRET` for security. Transaction confirmation endpoints validate signed PSBTs before broadcasting.

## Development Tools

`/debug` routes provide development utilities:

- Portfolio simulation and yield visualization
- UTXO distribution debugging
- Wallet signing flow testing
- Protocol parameter testing

These are development-only tools and should not be used in production.

## Key API Endpoints

**Main Operations:**

- `POST /api/stake` - Create PSBT for staking
- `POST /api/unstake` - Create PSBT for unstaking
- `POST /api/withdraw` - Create PSBT for withdrawing
- `POST /api/stake/confirm` - Validate and broadcast signed stake transaction
- `POST /api/unstake/confirm` - Validate and broadcast signed unstake transaction
- `POST /api/withdraw/confirm` - Validate and broadcast signed withdraw transaction

**Data Retrieval:**

- `GET /api/protocol` - Protocol stats and configuration
- `GET /api/account/balance` - Wallet balances for runes
- `GET /api/account/txs` - Transaction history
- `GET /api/stake/pending` - Pending stake transactions
- `GET /api/unstake/pending` - Pending unstake transactions

**Critical Cron Jobs:**

- `GET /api/cron/exchange_rate_pusher` - Updates exchange rates every 10 minutes (most critical)
- `GET /api/cron/token_holders` - Daily token holder snapshot
- `GET /api/cron/monitor/stake` - Monitors stake transaction status hourly
- `GET /api/cron/monitor/unstake` - Monitors unstake transaction status hourly
- `GET /api/cron/monitor/withdraw` - Monitors withdraw transaction status hourly

## Important Implementation Details

**Precision Handling:**

- Use `Big.js` for all decimal calculations to avoid floating-point precision issues
- All token amount calculations must use Big.js for precision
- Never use native JavaScript number operations for token amounts
- Big.js rounding modes: `0 = roundDown` (prevent over-allocation), `3 = roundUp` (ensure sufficient source amount)
- Input parsing uses `Big.js` to avoid float rounding (e.g., 2.3 stays 2.3, not 2.29)

**UTXO Management:**

- Redis is used for distributed UTXO locking to prevent double-assignation
- The `DESIRED_UTXOS` environment variable controls UTXO bisection limits
- UTXOs are assigned and released through the Redis coordination system

**Transaction Flow:**

1. Create PSBT via API endpoint
2. User signs with wallet
3. Validate signed transaction via confirm endpoint
4. Interact with canister
5. Broadcast to Bitcoin network
6. Monitor via cron jobs

**Environment Configuration:**

- All config is validated with Zod in `src/config/config.ts`
- Network can be `mainnet` or `testnet4`
- Critical environment variables include canister config, token metadata, and API keys

## Development Workflow

**Code Quality:**

- Husky pre-commit hooks
- lint-staged for staged file formatting
- Prettier with Tailwind CSS plugin
- ESLint with Next.js configuration

**Database Development:**

- Drizzle ORM with PostgreSQL
- Schema defined in `src/db/schema.ts`
- Services layer for database operations

## External Dependencies

**Blockchain APIs:**

- Ordiscan API for rune price data (primary)
- Best In Slot API for rune data (fallback)
- mempool.space for Bitcoin blockchain data
- Internet Computer Protocol canister integration

**Key Libraries:**

- `@magiceden-oss/runestone-lib` for rune operations
- `bitcoinjs-lib` for Bitcoin transaction handling
- `@omnisat/lasereyes-react` for wallet integration
- `@dfinity/agent` for ICP canister communication
- `big.js` for precise decimal arithmetic
- `runelib` for rune-specific operations

## Critical Notes

- The exchange rate cron job is the most critical system component
- All token amount calculations must use Big.js for precision
- UTXO coordination via Redis prevents double-spending
- Environment variables are strictly validated with Zod
- Debug tools are for development only, not production
- P2SH-P2WPKH address support is implemented in PSBT builder
- Logger utility provides environment-aware logging (debug in dev, info+ in prod)

# General Guidelines
- NEVER run format for all files in this repo - only files you touch or edit.
- NEVER ignore es-lint; NEVER use the 'any' type and try to avoid 'unknown' type. Type everything properly following best practices of NextJS and Typescript.
- Do NOT use magic strings, use enums or constants instead if possible.
- Do NOT add unnecessary comments to the code. Only add comments that are helpful and relevant following NextJS best practices.
- Always add rel="noopener noreferrer" to external Links

# Context7 Library IDs
- BIP-322: acken2/bip322-js
- Best In Slot: websites/bestinslot_xyz
- Ordiscan: websites/ordiscan_api
- Lasereyes: omnisat/lasereyes-mono
- BitcoinJS: bitcoinjs/bitcoinjs-lib
- Posthog: posthog/posthog
- Big.JS: mikemcl/big.js
- Recharts: recharts/recharts
