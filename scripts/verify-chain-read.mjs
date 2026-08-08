#!/usr/bin/env node
// Live check: read the deployed VELO contract's ledger from Midnight.
//
//   npm run build && node scripts/verify-chain-read.mjs
//
// This one hits the real network on purpose. Its offline sibling lives in
// tests/chain.test.ts, which decodes a captured real state with an injected
// fetch — a test suite that fails when the network is down is a suite people
// learn to ignore, so the network-dependent check is kept out of it and put
// here instead.
import { readOnChainLedger, contractAddress, networkId, indexerUrl } from "../dist/src/chain/read.js";

console.log(`network : ${networkId()}`);
console.log(`indexer : ${indexerUrl()}`);
console.log(`contract: ${contractAddress()}`);
console.log();

try {
  const ledger = await readOnChainLedger();
  console.log(`attestationCount : ${ledger.attestationCount}`);
  console.log(`attestations     : ${ledger.attestations.length}`);
  for (const a of ledger.attestations) {
    console.log(`   ${a.commitment}  ->  ${a.verdict}`);
  }
  if (ledger.attestations.length === 0) {
    console.log("\n(no attestations yet — expected until attest_case can write)");
  }
  console.log("\nOK: the contract is deployed and its ledger is readable.");
} catch (err) {
  console.error(`\nFAILED: ${err instanceof Error ? err.message : String(err)}`);
  console.error("\nThis is a read failure, which is NOT the same as 'zero attestations'.");
  process.exit(1);
}
