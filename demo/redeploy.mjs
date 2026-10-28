// Upgrade the vault code in place (state layout unchanged). Works only while the vault still has its deploy key.
import fs from "fs";
import { vaultAcc, VAULT, explorer } from "./lib.mjs";
const r = await vaultAcc().deployContract(fs.readFileSync("../target/wasm32-unknown-unknown/release/leash_near.wasm"));
console.log("redeployed", VAULT, explorer(r.transaction_outcome.id));
