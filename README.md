
# ChainKey — On-Chain API Gateway & Rate Limiter

> Rebuilding a traditional Web2 API key management backend as a Solana distributed state machine.

![Solana](https://img.shields.io/badge/Solana-Devnet-9945FF?logo=solana&logoColor=white)
![Anchor](https://img.shields.io/badge/Anchor-0.32.1-512BD4)
![Rust](https://img.shields.io/badge/Rust-2021-CE422B?logo=rust&logoColor=white)
![Tests](https://img.shields.io/badge/Tests-30%20passing-brightgreen)
![License](https://img.shields.io/badge/License-MIT-yellow)

---

## The Problem

Every API backend — Stripe, GitHub, AWS — runs the same stack for key management:

- PostgreSQL stores key records
- Redis tracks rate limits
- Middleware checks every request
- An admin panel manages everything

This works, but it means trusting a central server. If that server gets breached, goes down, or the operator silently changes permissions — there's no way to know.

ChainKey moves all of that on-chain. The Solana account model replaces the database, slot-based counters replace Redis, and cryptographic signatures replace admin sessions.

---

## Architecture

### Web2 vs Solana

```
WEB2 BACKEND                          CHAINKEY (SOLANA)
─────────────                         ─────────────────
API Server (Node/Python)              Solana Program (Rust)
     │                                       │
     ▼                                       ▼
PostgreSQL                            Project PDA
  projects table                      ApiKey PDA
  api_keys table                      UsageAccount PDA
     │                                       │
     ▼                                       ▼
Redis                                 Slot-based window
  rate limit counters                 on-chain counter
     │                                       │
     ▼                                       ▼
Audit logger (async)                  On-chain events (permanent)
```

### Concept Mapping

| Web2 | Solana (ChainKey) |
|---|---|
| PostgreSQL row | PDA (Program Derived Address) |
| Primary key / auto-increment | PDA seed derivation |
| Redis `INCR` counter | UsageAccount `request_count` |
| Auth middleware | `verify_api_key` instruction |
| `bcrypt.compare()` | `constant_time_eq()` on SHA-256 |
| Admin role check | `has_one = authority` (Ed25519 sig) |
| `DELETE FROM ...` | `close_usage_account` (reclaims rent) |
| Async audit log | On-chain events (`emit!`) |

---

## Account Model

All accounts are PDAs with deterministic seeds:

```
PROJECT PDA
  seeds = ["project", authority_pubkey, project_id(16 bytes)]
  ┃
  ┣━ API KEY PDA
  ┃    seeds = ["api_key", project_pda, key_index(u16 LE)]
  ┃    ┃
  ┃    ┗━ USAGE PDA
  ┃         seeds = ["usage", api_key_pda]
  ┃
  ┣━ API KEY PDA (index=1)
  ┃    ┗━ USAGE PDA
  ┃
  ┗━ ... (up to 100 keys/project)
```

Usage is separated from ApiKey for the same reason Web2 separates credentials from audit tables — write-heavy rate limit updates shouldn't contend with credential reads.

### Account Fields

**Project** — namespace and ownership

| Field | Type | Description |
|---|---|---|
| authority | Pubkey | owner wallet |
| project_id | [u8; 16] | random unique ID |
| name | String (64) | label |
| description | String (128) | description |
| default_rate_limit | u32 | default for new keys |
| total_keys / active_keys | u16 | counters |

**ApiKey** — credential record

| Field | Type | Description |
|---|---|---|
| key_hash | [u8; 32] | SHA-256 of raw secret |
| scopes | Vec\<String\> (max 8) | permission scopes |
| status | enum | Active / Revoked / Suspended |
| rate_limit | u32 | max requests per window |
| expires_at | Option\<u64\> | optional slot-based expiry |
| failed_verifications | u8 | auto-revoke at 10 |

**UsageAccount** — hot-path counters

| Field | Type | Description |
|---|---|---|
| window_start | u64 | slot when window opened |
| request_count | u32 | requests in current window |
| last_used_at | u64 | last verification slot |

---

## Instructions

| Instruction | Who | What |
|---|---|---|
| `create_project` | Anyone (becomes authority) | Creates project PDA |
| `transfer_project_authority` | Authority | Hands off ownership |
| `issue_api_key` | Authority | Creates ApiKey + Usage PDAs |
| `verify_api_key` | Any signer | Hash check + scope + rate limit |
| `rotate_api_key` | Authority | Atomically replaces hash |
| `update_scopes` | Authority | Changes permission scopes |
| `update_rate_limit` | Authority | Changes per-key limit |
| `revoke_api_key` | Authority | Permanent (terminal) |
| `suspend_api_key` | Authority | Temporary disable |
| `reactivate_api_key` | Authority | Re-enable suspended key |
| `close_usage_account` | Authority | Close + reclaim rent |

### Key State Machine

```
  Active ──── suspend ────▶ Suspended
    │                          │
    │                     reactivate
    │                          │
    ├── revoke ──▶ Revoked ◀───┘
    │              (terminal)
    └── rotate ──▶ Active (new hash)
```

---

## Rate Limiting

Slot-based sliding window. 216,000 slots ≈ 24 hours at 400ms/slot.

```
on verify_api_key:
  if usage.window_start < (current_slot - 216_000):
    reset window
  if request_count >= rate_limit:
    error RateLimitExceeded
  else:
    increment count
```

I use slots instead of timestamps because `Clock::slot` is consensus-derived and deterministic across all validators. No ambiguity about whether a request falls inside or outside the window.

---

## Security

- **Secret never on-chain** — only SHA-256 hash is stored. Same approach as Stripe/GitHub.
- **Constant-time comparison** — prevents timing attacks on hash matching.
- **Auto-revoke** — 10 consecutive failed verifications triggers automatic revocation.
- **Authority enforcement** — Anchor `has_one` constraint + `Signer` = cryptographic proof, not application logic.
- **Wildcard scope** — `"*"` supported as a catch-all.

---

## Tradeoffs

### Where this beats Web2

| | Web2 | ChainKey |
|---|---|---|
| Audit trail | async, can be lost | permanent on-chain |
| Key rotation | race condition risk | atomic single tx |
| Auth | JWT/session tokens | Ed25519 sigs |
| Revocation | DB + cache + CDN flush | one instruction |
| Trust | trust the operator | code-enforced |

### Limitations

| Constraint | Detail |
|---|---|
| Latency | ~400ms–5s per verify vs <1ms with Redis |
| Cost | ~0.000005 SOL per verify (~$0.001) |
| Public state | metadata visible on-chain (hash only, not secret) |
| Account size | fixed at init, max 8 scopes |
| No cron | windows reset lazily on next request |
| Max 100 keys/project | hard-coded limit |

### When NOT to use this

- Sub-millisecond latency requirements
- >1,000 verifications/sec per key
- Sensitive data in scope labels (public state)
- You're fine with centralized authority (just use Postgres)

---

## Getting Started

### Prerequisites

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/stable/install)"
cargo install --git https://github.com/coral-xyz/anchor avm --locked
avm install 0.32.1 && avm use 0.32.1
```

### Build & Deploy

```bash
git clone https://github.com/Eniyanyosuva/ChainKey.git
cd ChainKey
npm install

solana config set --url devnet
solana airdrop 2     # or use faucet.solana.com

anchor keys sync
anchor build
anchor deploy --provider.cluster devnet
```

### Run Tests

```bash
anchor test
```

---

## CLI

```bash
# create a project
node cli/index.js create-project --name "My API" --rate-limit 1000

# issue a key (secret generated client-side, hash stored on-chain)
node cli/index.js issue --project-id <hex> --name "Prod Key" --scopes "read:data,write:data"

# verify
node cli/index.js verify --project-id <hex> --key-index 0 --secret sk_...

# rotate (old secret instantly invalidated)
node cli/index.js rotate --project-id <hex> --key-index 0

# revoke, suspend, reactivate
node cli/index.js revoke     --project-id <hex> --key-index 0
node cli/index.js suspend    --project-id <hex> --key-index 0
node cli/index.js reactivate --project-id <hex> --key-index 0

# inspect
node cli/index.js list-keys --project-id <hex>
node cli/index.js inspect project --project-id <hex>
node cli/index.js inspect key --project-id <hex> --key-index 0
```

---

## Test Coverage

30 tests across 9 groups:

| Group | Tests | Covers |
|---|---|---|
| Project Management | 4 | create, reject bad name/desc/rate |
| Key Issuance | 4 | issue, override rate, bad index, too many scopes |
| Verification | 6 | correct hash, scope check, bad hash, bad scope, fail counter |
| Rate Limiting | 2 | within limit passes, exceeds limit rejected |
| Authorization | 4 | non-authority rejected on issue/revoke/update/rotate |
| Updates | 2 | update scopes & rate limit |
| Key Rotation | 3 | rotate, old fails, new works |
| Lifecycle | 7 | suspend, fail verify, reactivate, verify again, revoke, fail verify |
| Rent Reclamation | 1 | close usage, reclaim SOL |

---

## Project Structure

```
ChainKey/
├── programs/chain-key/src/lib.rs    # Anchor program (672 lines)
├── tests/chain-key.ts               # Integration tests (30 tests)
├── cli/index.js                     # CLI client (9 commands)
├── app/                             # Next.js dashboard
│   └── src/
│       ├── app/                     # pages: landing, dashboard, analytics
│       ├── components/              # layout, modals, shader animation
│       └── utils/chainkey.ts        # frontend program utils
├── Anchor.toml
└── package.json
```

---

## Devnet

| | |
|---|---|
| Program ID | `<ADD_AFTER_DEPLOY>` |
| Deploy tx | `<ADD_AFTER_DEPLOY>` |
| create_project tx | `<ADD_AFTER_DEPLOY>` |
| issue_api_key tx | `<ADD_AFTER_DEPLOY>` |
| verify_api_key tx | `<ADD_AFTER_DEPLOY>` |

---

## Future Work

- Simulation-based verification (free reads via `simulateTransaction`)
- Tiered rate limits per scope
- Multi-sig authority for critical operations
- Account compression for cheaper storage at scale
- `@chainkey/sdk` npm package for server-side integration

---

MIT
