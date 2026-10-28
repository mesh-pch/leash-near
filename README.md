# Leash on NEAR

A spending-policy vault for AI agents, written as a NEAR smart contract (Rust, `near-sdk` 5.x).
Built for NEAR HACKATHON (draft submission), track **AI Security & Defense** (also fits Agent Economy and Autonomous Business).

## Problem
An AI agent that can pay needs a wallet. If the agent is prompt-injected, whoever controls the prompt controls the wallet.

## What it does
The vault account is the contract's own account. The owner funds it and registers each agent's **function-call access key**.
The contract adds that key to its own account, restricted to the methods `spend,spend_ft`. The agent never holds a full-access key: it cannot call `approve`, `reject`, `set_policy` or any owner method, and it cannot do a raw transfer (the NEAR runtime rejects those for a function-call key).

Each agent key has a policy:

| Policy field | Effect |
| --- | --- |
| `per_tx_cap` | Largest single NEAR payment (yoctoNEAR) that executes without approval |
| `daily_cap` | Largest total NEAR in a rolling 24h window that executes without approval |
| `allowlist` | If non-empty, payments to other accounts are queued, not executed |
| `expires_at` | Nanosecond timestamp after which the key is rejected (0 = never) |
| `paused` | Kill switch, per agent |
| token limit (per token) | Own `per_tx_cap` and `daily_cap` for each NEP-141 token, set with `set_token_limit` (budgets are independent of the NEAR budget and of other tokens) |

`spend(to, amount, memo)` (native NEAR) and `spend_ft(token, to, amount, memo)` (NEP-141):
- within policy: transfer executes immediately, event `payment_executed`
- outside policy (over a cap, recipient not on allowlist, or token has no limit set): the payment goes into a pending queue, event `payment_queued` with the reason. Funds stay in the vault until the owner calls `approve(id)` or `reject(id)`
- token transfers call `ft_transfer` with 1 yocto and a callback. If the token transfer fails, the payment goes back into the queue and the budget is not consumed
- paused, expired or unregistered key: the call panics

Owner methods: `register_agent`, `set_policy`, `set_paused`, `revoke_agent` (also deletes the access key), `set_token_limit`, `remove_token_limit`, `approve`, `reject`.
Views: `get_owner`, `get_policy`, `list_pending`, `spent_in_window`, `get_token_limit`, `token_spent_in_window`.
Every decision logs a NEP-297-style `EVENT_JSON` line (standard `leash`, version `1.0.0`). Events are built with `serde_json`, so a hostile memo cannot inject fields (there is a test for this).

## Try it (do X - see Y)

### 1. Unit tests (Rust stable only)
```sh
git clone https://github.com/mesh-pch/leash-near && cd leash-near
cargo test
```
Expected: `test result: ok. 21 passed; 0 failed`. Covers: payment within policy, over-cap queued then approved, allowlist queueing, rolling 24h reset, kill switch, expiry, agent unable to call owner methods, unregistered/stranger keys, the NEP-141 variants of all of these (including the failed-transfer requeue), independent native and token budgets, and the hostile-memo event test.

### 2. Live testnet demo (a scripted agent hit by a prompt injection)
Requires Node 20+ and the wasm target: `rustup target add wasm32-unknown-unknown`.
```sh
cargo build --release --target wasm32-unknown-unknown            # vault
(cd mock-ft && cargo build --release --target wasm32-unknown-unknown)   # demo-only mock LUSD token
cd demo && npm install
node demo.mjs
```
Keys are read from a JSON file **outside the repo**: `~/secrets/near_testnet_keys.json` (override with `LEASH_KEYS=/path`). It must contain `owner`, `vault`, `usd`, `provider`, `attacker` (each `{account_id, public_key, private_key}`) and `agent` (`{public_key, private_key}`). Create the four named testnet accounts (e.g. via `https://helper.testnet.near.org/account`), then run `node deploy.mjs` once to deploy and configure. The repo contains no keys.

`demo.mjs` runs six steps with real transactions: normal payments execute; a "prompt-injected" agent tries to send NEAR and tokens to an attacker (all queued, nothing moves); the agent tries to call `approve` and to transfer directly (both blocked); the owner reviews the queue and rejects; a legitimate 80 LUSD payment is queued and the owner approves it; the owner pauses the agent and its next payment fails.

## Live testnet deployment (evidence)
| Item | Account / link |
| --- | --- |
| Vault contract | `leash-vault-pch.testnet` |
| Owner | `leash-owner-pch.testnet` |
| Mock LUSD token (NEP-141, demo only) | `leash-usd-pch.testnet` |
| Deploy vault | https://testnet.nearblocks.io/txns/FedncGxghRkm7Fj2jHsG6oTQ9VVijN1vHjZrTbQ8rX7i |
| Upgrade vault (final code) | https://testnet.nearblocks.io/txns/4enjDipmXQHzRpW3w9VPCxSuRNKQ6MuYk3Zpyw4y3A8n |
| Deploy token | https://testnet.nearblocks.io/txns/CuTyvYC1quzHR9PAjapEiPzPkRsSmxzFkpf9DBMpAnde |
| `register_agent` | https://testnet.nearblocks.io/txns/9sWUu1AMBHvxA5w22NGnUSKKjJyxUBt3t25vehcVQLBB |
| `set_token_limit` | https://testnet.nearblocks.io/txns/4ze5ups4jVNsH3aqtJmA6MyinHRqkwRsScPM4BuM79y9 |

Every demo run prints the explorer link of each transaction it sends. A demo video is attached to the GitHub release.

## Status / honest scope
- Built and unit-tested: native NEAR and NEP-141 spending, per-asset caps, allowlist, expiry, kill switch, pending queue with owner approve/reject, events.
- Built and run live on testnet: the deployment above and the scripted demo agent (`demo/demo.mjs`).
- The demo "agent" is a script that simulates a prompt-injected agent. It is **not** an LLM and the repo does not include an LLM integration.
- The LUSD token is a mock written for the demo. The vault works with any NEP-141 token that follows `ft_transfer`.
- Not built: NEAR Intents / cross-chain settlement, TEE, mainnet deployment, a UI. The contract has had no audit.
- Known limitation: the release wasm built with the current toolchain surfaces policy panics (paused, expired) as a generic "unreachable" trap on testnet rather than the message text. The unit tests assert the intended messages. Queued payments carry their reason in events and `list_pending`.
- The vault account still has its deploy key on testnet (needed to upgrade during development). A production deployment should delete the full-access key after `new`, so only the owner and agent keys remain.

## Disclosure
- Existing product on another chain: the same concept exists as [Leash for HashKey Chain](https://github.com/mesh-pch/leash-hashkey) (Solidity, separate codebase, separate hackathon). This NEAR contract is a new implementation using NEAR function-call keys; nothing is copied from the Solidity code. Per hackathon rule Q-002, only the NEAR work is the submission.
- Code was written with AI assistance (rule Q-005). Dependencies: `near-sdk`.
- Pre-hackathon baseline: none (all NEAR code was written after the 2026-10-19 announcement, rule Q-001).

## License
MIT
