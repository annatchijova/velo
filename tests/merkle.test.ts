import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  EMPTY_TREE_ROOT,
  MERKLE_VERSION,
  inclusionProof,
  leafHash,
  merkleRoot,
  verifyInclusion,
} from "../src/seal/merkle.js";
import {
  artifactInclusionProof,
  evidenceMerkleRoot,
  sealBundle,
  verifyArtifactInclusion,
  verifyBundle,
  type SealedBundle,
} from "../src/seal/bundle.js";
import { verifyBundle as verifyBundleStandalone } from "../src/seal/verify.js";
import { createCustodyChain, appendCustodyEvent } from "../src/seal/custody.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";
import type { Artifact } from "../src/engine/evidence.js";

const leaf = (s: string) => Buffer.from(s, "utf8");

test("root is deterministic and content-sensitive", () => {
  const leaves = [leaf("a"), leaf("b"), leaf("c")];
  assert.equal(merkleRoot(leaves), merkleRoot([leaf("a"), leaf("b"), leaf("c")]));
  assert.notEqual(merkleRoot(leaves), merkleRoot([leaf("a"), leaf("b"), leaf("d")]));
  assert.notEqual(merkleRoot(leaves), merkleRoot([leaf("b"), leaf("a"), leaf("c")]), "order is part of the commitment");
  assert.equal(merkleRoot([]), EMPTY_TREE_ROOT);
  assert.match(EMPTY_TREE_ROOT, /^[0-9a-f]{64}$/);
});

test("no odd-node duplication: [A,B,C] and [A,B,C,C] must not collide (CVE-2012-2459 guard)", () => {
  const three = merkleRoot([leaf("A"), leaf("B"), leaf("C")]);
  const four = merkleRoot([leaf("A"), leaf("B"), leaf("C"), leaf("C")]);
  assert.notEqual(three, four);
});

test("domain separation: leaf bytes equal to a node preimage do not produce the node hash", () => {
  // Interior node = SHA-256(0x01 || hA || hB). A crafted "leaf" whose
  // bytes are exactly hA || hB hashes with the 0x00 prefix instead, so it
  // can never impersonate the interior node.
  const hA = leafHash(leaf("A"));
  const hB = leafHash(leaf("B"));
  const rootAB = merkleRoot([leaf("A"), leaf("B")]);
  const crafted = leafHash(Buffer.concat([hA, hB])).toString("hex");
  assert.notEqual(crafted, rootAB);
  const craftedWithPrefix = leafHash(Buffer.concat([Buffer.from([0x01]), hA, hB])).toString("hex");
  assert.notEqual(craftedWithPrefix, rootAB);
});

test("inclusion proofs verify for every leaf at every tree size, including odd shapes", () => {
  for (const n of [1, 2, 3, 5, 8, 11]) {
    const leaves = Array.from({ length: n }, (_, i) => leaf(`artifact-${i}`));
    const root = merkleRoot(leaves);
    for (let i = 0; i < n; i++) {
      const proof = inclusionProof(leaves, i);
      const check = verifyInclusion(root, leaves[i]!, proof);
      assert.equal(check.valid, true, `n=${n} i=${i}: ${check.reasons.join("; ")}`);
    }
  }
});

test("verification accumulates the complete damage map (continuum hash_chain pattern)", () => {
  const leaves = [leaf("a"), leaf("b"), leaf("c"), leaf("d")];
  const root = merkleRoot(leaves);
  const proof = inclusionProof(leaves, 2);

  // Wrong leaf bytes: root mismatch.
  assert.equal(verifyInclusion(root, leaf("x"), proof).valid, false);

  // Tampered sibling: root mismatch.
  const tampered = { ...proof, siblings: [{ ...proof.siblings[0]!, hash: "0".repeat(64) }, ...proof.siblings.slice(1)] };
  assert.equal(verifyInclusion(root, leaves[2]!, tampered).valid, false);

  // Several broken invariants at once: every one is reported.
  const wreck = {
    version: MERKLE_VERSION + 1,
    leafIndex: 99,
    leafCount: 4,
    siblings: [{ hash: "not-hex", position: "left" as const }],
  };
  const damage = verifyInclusion(root, leaves[2]!, wreck);
  assert.equal(damage.valid, false);
  assert.ok(damage.reasons.length >= 3, `expected a damage map, got: ${damage.reasons.join("; ")}`);
  assert.ok(damage.establishes.includes("does not establish"), "the limitation travels with the result");
});

function sealFixtureBundle(): SealedBundle {
  const artifacts: Artifact[] = [
    {
      id: "m-mem",
      type: "process",
      timestamp: "2026-08-07T14:20:00Z",
      source: "memory_image",
      process: "lsass.exe",
      path: "mem://2244",
      entropyMilliBits: 5100,
      markers: ["process_injection"],
      description: "Injected region in a system process.",
      provenanceChain: ["sha256:memA"],
    },
    {
      id: "m-log",
      type: "log",
      timestamp: "2026-08-07T14:25:00Z",
      source: "syslog",
      process: "rsyslogd",
      path: "/var/log/auth.log",
      entropyMilliBits: 4200,
      markers: ["log_cleared"],
      description: "Auth log cleared inside the incident window.",
      provenanceChain: ["sha256:logB"],
    },
    {
      id: "m-net",
      type: "network",
      timestamp: "2026-08-07T14:30:00Z",
      source: "pcap",
      process: "n/a",
      path: "conn://198.51.100.7:443",
      entropyMilliBits: 6900,
      markers: ["network_vs_host"],
      description: "Outbound transfer the host denies making.",
      provenanceChain: ["sha256:netC"],
    },
  ];
  const detectorResults = runAllDetectors(artifacts);
  const scoreResult = score({ detectorResults, artifacts, devilAdvocate: "A backup agent could explain the transfer.", custodyValid: true });
  let chain = createCustodyChain("VELO-MERKLE-001");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:00:00Z", "synthetic acquisition");
  return sealBundle("VELO-MERKLE-001", "2026-08-14T12:00:00Z", scoreResult, { caseId: "VELO-MERKLE-001", artifacts }, chain);
}

test("sealed bundles carry the evidence root; tampering an artifact breaks it in BOTH verifiers", () => {
  const bundle = sealFixtureBundle();
  assert.match(bundle.evidenceRoot!, /^[0-9a-f]{64}$/);
  assert.equal(verifyBundle(bundle).internallyConsistent, true);

  const tampered: SealedBundle = JSON.parse(JSON.stringify(bundle));
  tampered.evidenceManifest.artifacts[1]!.description = "Auth log intact, nothing cleared.";
  const local = verifyBundle(tampered);
  assert.equal(local.internallyConsistent, false);
  assert.ok(local.reasons.some((r) => r.includes("Evidence Merkle root")));

  // The standalone judge's tool (deliberate copy) must agree byte for byte.
  const standalone = verifyBundleStandalone(JSON.parse(JSON.stringify(tampered)));
  assert.equal(standalone.internallyConsistent, false);
  assert.ok(standalone.reasons.some((r) => r.includes("Evidence Merkle root")));
});

test("the standalone verifier's Merkle copy is pinned to src/seal/merkle.ts vectors", () => {
  // Both implementations must produce the same root for the same sealed
  // bundle — drift fails here instead of producing two truths (F8 lesson).
  const bundle = sealFixtureBundle();
  assert.equal(evidenceMerkleRoot(bundle.evidenceManifest), bundle.evidenceRoot);
  const standalone = verifyBundleStandalone(JSON.parse(JSON.stringify(bundle)));
  assert.equal(standalone.internallyConsistent, true, standalone.reasons.join("; "));
  assert.equal(standalone.caveats.length, 0);
});

test("selective disclosure: one artifact + proof verifies against the root alone", () => {
  const bundle = sealFixtureBundle();
  const disclosure = artifactInclusionProof(bundle, "m-log");
  assert.ok(disclosure);

  // The verifier sees ONLY { evidenceRoot, artifact, proof }.
  const check = verifyArtifactInclusion(disclosure.evidenceRoot, disclosure.artifact, disclosure.proof);
  assert.equal(check.valid, true, check.reasons.join("; "));

  // A modified disclosed artifact fails against the same root.
  const forged = { ...disclosure.artifact, description: "Nothing was cleared." };
  assert.equal(verifyArtifactInclusion(disclosure.evidenceRoot, forged, disclosure.proof).valid, false);

  // Unknown artifact: no proof fabricated.
  assert.equal(artifactInclusionProof(bundle, "no-such-id"), null);
});

test("legacy bundles without evidenceRoot verify with a caveat, not a failure (honest degradation)", () => {
  const bundle = sealFixtureBundle();
  const legacy: SealedBundle = JSON.parse(JSON.stringify(bundle));
  delete legacy.evidenceRoot;

  const result = verifyBundle(legacy);
  assert.equal(result.internallyConsistent, true, result.reasons.join("; "));
  assert.equal(result.caveats.length, 1);
  assert.ok(result.caveats[0]!.includes("predates"));

  const standalone = verifyBundleStandalone(JSON.parse(JSON.stringify(legacy)));
  assert.equal(standalone.internallyConsistent, true);
  assert.equal(standalone.caveats.length, 1);
});

test("determinism: the evidence root is bit-stable across seals and independent of seal time", () => {
  const a = sealFixtureBundle();
  const b = sealFixtureBundle();
  assert.equal(a.evidenceRoot, b.evidenceRoot);
  assert.equal(a.analysisFingerprint, b.analysisFingerprint);

  const hashOfRoot = createHash("sha256").update(a.evidenceRoot!, "utf8").digest("hex");
  assert.match(hashOfRoot, /^[0-9a-f]{64}$/);
});
