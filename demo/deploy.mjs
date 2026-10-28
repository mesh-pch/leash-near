// Deploys mock LUSD token + Leash vault to NEAR testnet and configures one agent policy.
// Build first:  (repo root) cargo build --release --target wasm32-unknown-unknown
//               (mock-ft)   cargo build --release --target wasm32-unknown-unknown
import fs from "fs";
import { keys, call, view, ownerAcc, vaultAcc, tokenAcc, OWNER, VAULT, TOKEN, PROVIDER, ATTACKER, AGENT_PK, NEAR, LUSD, explorer } from "./lib.mjs";

const leashWasm = fs.readFileSync("../target/wasm32-unknown-unknown/release/leash_near.wasm");
const tokenWasm = fs.readFileSync("../mock-ft/target/wasm32-unknown-unknown/release/mock_ft.wasm");
const step = (name, r) => { console.log(`${r.ok ? "ok  " : "FAIL"} ${name}${r.hash ? "  " + explorer(r.hash) : ""}${r.error ? "\n     " + r.error : ""}`); if (!r.ok) process.exit(1); return r; };

// 1. token
let r = await tokenAcc().deployContract(tokenWasm);
console.log("ok   deploy mock LUSD ->", TOKEN, explorer(r.transaction_outcome.id));
step("token.new", await call(tokenAcc(), TOKEN, "new", {}));

// 2. vault
r = await vaultAcc().deployContract(leashWasm);
console.log("ok   deploy Leash vault ->", VAULT, explorer(r.transaction_outcome.id));
step("vault.new", await call(vaultAcc(), VAULT, "new", { owner: OWNER }));

// 3. owner registers the agent key (function-call key on the vault, methods: spend,spend_ft)
step("register_agent", await call(ownerAcc(), VAULT, "register_agent", {
  agent: AGENT_PK,
  policy: {
    per_tx_cap: (2n * NEAR).toString(),      // 2 NEAR per payment
    daily_cap: (5n * NEAR).toString(),       // 5 NEAR per rolling 24h
    allowlist: [PROVIDER],                    // only the API provider is paid instantly
    expires_at: 0,
    paused: false,
  },
  allowance: (NEAR / 2n).toString(),          // gas allowance of the function-call key: 0.5 NEAR
}));
step("set_token_limit(LUSD)", await call(ownerAcc(), VAULT, "set_token_limit", {
  agent: AGENT_PK, token: TOKEN,
  limit: { per_tx_cap: (50n * LUSD).toString(), daily_cap: (120n * LUSD).toString() },
}));

// 4. token storage registration + mint demo funds into the vault
for (const who of [VAULT, PROVIDER, ATTACKER, OWNER]) {
  step(`storage_deposit ${who.slice(0, 10)}…`, await call(ownerAcc(), TOKEN, "storage_deposit", { account_id: who, registration_only: true }, { deposit: NEAR / 100n }));
}
step("mint 1000 LUSD -> vault", await call(ownerAcc(), TOKEN, "mint", { to: VAULT, amount: (1000n * LUSD).toString() }));

console.log("\npolicy:", JSON.stringify(await view(VAULT, "get_policy", { agent: AGENT_PK })));
console.log("vault LUSD:", await view(TOKEN, "ft_balance_of", { account_id: VAULT }));
