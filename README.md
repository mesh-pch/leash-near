# Leash on NEAR

A spending-policy vault for AI agents, written as a NEAR smart contract (Rust, `near-sdk` 5.x).
Built for NEAR HACKATHON, track **AI Security & Defense** (also fits Agent Economy and Autonomous Business).

## Problem
An AI agent that can pay needs a wallet. If the agent is prompt-injected, whoever controls the prompt controls the wallet.

## What it does
The vault account is the contract's own account. The owner funds it and registers each agent's **function-call access key**.
The contract adds that key to its own account, restricted to the `spend` method. The agent never holds a full-access key.

Each agent key has a policy:

| Policy field | Effect |
| --- | --- |
| `per_tx_cap` | Largest single payment (yoctoNEAR) that executes without approval |
| `daily_cap` | Largest total in a rolling 24h window that executes without approval |
| `allowlist` | If non-empty, payments to other accounts are not executed instantly |
| `expires_at` | Nanosecond timestamp after which the key is rejected (0 = never) |
| `paused` | Kill switch, per agent |

`spend(to, amount, memo)`:
- within policy: transfer executes immediately, event `payment_executed`
- outside policy (over a cap, or recipient not on allowlist): the payment goes into a pending queue, event `payment_queued`, funds stay in the vault until the owner calls `approve(id)` or `reject(id)`
- paused, expired or unregistered key: the call panics

Owner methods: `register_agent`, `set_policy`, `set_paused`, `revoke_agent` (also deletes the access key), `approve`, `reject`.
Views: `get_owner`, `get_policy`, `list_pending`, `spent_in_window`.
Every decision logs a `EVENT_JSON` line with standard `nep297` / `leash` / `1.0.0` for an audit trail.

## Try it (do X - see Y)
Requires Rust (stable) only.

```sh
git clone https://github.com/mesh-pch/leash-near && cd leash-near
cargo test
```
Expected: `test result: ok. 9 passed; 0 failed` (see `src/lib.rs`, `mod tests`). Tests cover: payment within policy, over-cap queued then approved by owner, rolling 24h cap reset, kill switch, expired key, unregistered key, and more.

Build the wasm (needs `cargo install cargo-near`): `cargo near build non-reproducible-wasm`.

## Status / honest scope
- Implemented and unit-tested: native NEAR transfers, policy checks, pending queue, kill switch, events.
- Not yet implemented: NEP-141 token support, a deployed testnet instance, a TypeScript demo agent. These are planned work inside the hackathon window and will be added in this repo.

## Disclosure
- Existing product on another chain: the same concept exists as [Leash for HashKey Chain](https://github.com/mesh-pch/leash-hashkey) (Solidity, separate codebase, separate hackathon). This NEAR contract is a new implementation using NEAR function-call keys; nothing is copied from the Solidity code. Per hackathon rule Q-002, only the NEAR work is the submission.
- Code was written with AI assistance (rule Q-005). Dependencies: `near-sdk`.
- Pre-hackathon baseline: none (all NEAR code was written after the 2026-10-19 announcement, rule Q-001).

## License
MIT
