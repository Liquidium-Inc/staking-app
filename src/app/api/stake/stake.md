```mermaid
sequenceDiagram
    actor User
    participant Wallet
    participant Backend
    participant Redis
    participant Canister
    participant Mempool
    participant DB

    User->>+Backend: Create PSBT
    Backend->>Redis: Lock UTXO
    Redis->>Backend:
    Backend->>-User:
    User->>Wallet: Sign PSBT
    Wallet->>User:
    User->>+Backend: Confirm Signature
    Backend->>+Redis: Extend Locks
    Redis->>-Backend:
    Backend->>Backend: Validate
    Backend->>Canister: Send PSBT
    Canister->>Backend:
    Backend->>Mempool: Broadcast
    Mempool->>Backend:
    Backend->>DB: Store
    DB->>Backend:
    Backend->>-User: TX
```
