// Shared helpers. Keys are read from a JSON file OUTSIDE the repo (never commit it).
// Default: ~/secrets/near_testnet_keys.json  (override with LEASH_KEYS=/path/to/file)
import { Account, JsonRpcProvider } from "near-api-js";
import fs from "fs";
import os from "os";
import path from "path";

export const RPC = process.env.NEAR_RPC || "https://test.rpc.fastnear.com";
export const provider = new JsonRpcProvider({ url: RPC });
export const keys = JSON.parse(
  fs.readFileSync(process.env.LEASH_KEYS || path.join(os.homedir(), "secrets", "near_testnet_keys.json"), "utf8")
);
export const OWNER = keys.owner.account_id;
export const VAULT = keys.vault.account_id;
export const TOKEN = keys.usd.account_id;
export const PROVIDER = keys.provider.account_id; // legitimate API provider (recipient)
export const ATTACKER = keys.attacker.account_id; // address the prompt injection tries to pay
export const AGENT_PK = keys.agent.public_key;

export const ownerAcc = () => new Account(OWNER, provider, keys.owner.private_key);
export const vaultAcc = () => new Account(VAULT, provider, keys.vault.private_key); // full-access key, deploy only
export const tokenAcc = () => new Account(TOKEN, provider, keys.usd.private_key);
// The agent signs AS THE VAULT, but with a function-call key limited to spend / spend_ft.
export const agentAcc = () => new Account(VAULT, provider, keys.agent.private_key);

export const NEAR = 10n ** 24n;
export const LUSD = 10n ** 6n;
export const TGAS = 10n ** 12n;
export const fmtNear = (y) => (Number(BigInt(y)) / 1e24).toFixed(2) + " NEAR";
export const fmtLusd = (u) => (Number(BigInt(u)) / 1e6).toFixed(2) + " LUSD";

export const view = (contractId, method, args = {}) => provider.callFunction({ contractId, method, args });

// Call a method and return { ok, result, logs, hash, error }. Never throws on contract panic.
export async function call(acc, contractId, methodName, args, { deposit = 0n, gas = 100n * TGAS } = {}) {
  try {
    const r = await acc.callFunctionRaw({ contractId, methodName, args, deposit, gas, waitUntil: "FINAL" });
    const logs = [];
    for (const ro of r.receipts_outcome || []) for (const l of ro.outcome.logs || []) logs.push(l);
    let failure = null;
    const walk = (s) => { if (s && s.Failure) failure = s.Failure; };
    walk(r.status);
    for (const ro of r.receipts_outcome || []) walk(ro.outcome.status);
    let result = null;
    const sv = r.status && r.status.SuccessValue;
    if (sv) { try { result = JSON.parse(Buffer.from(sv, "base64").toString()); } catch { result = null; } }
    return { ok: !failure, result, logs, hash: r.transaction_outcome.id, error: failure ? JSON.stringify(failure) : null };
  } catch (e) {
    return { ok: false, result: null, logs: [], hash: null, error: String(e.message || e).slice(0, 400) };
  }
}

export const explorer = (hash) => `https://testnet.nearblocks.io/txns/${hash}`;
