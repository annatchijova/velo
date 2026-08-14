/**
 * The narrative layer's contract, stated as tests:
 *
 * 1. THE SWAP TEST (doctrine): swapping the narrator backend changes only
 *    the wording — never the verdict, the seal, or any hash.
 * 2. The narrator runs strictly post-seal and cannot mutate the bundle.
 * 3. A missing or failing backend degrades the feature, never the core.
 * 4. No sealed-value-producing module imports the narrative layer.
 *
 * All backends here are in-memory fakes — no network, no live model. The
 * live backends (Ollama, Anthropic) implement the same NarratorBackend
 * interface these fakes do, which is exactly why the swap test holds for
 * them too.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { Artifact } from "../src/engine/evidence.js";
import { runAllDetectors } from "../src/engine/detectors.js";
import { score } from "../src/engine/scorer.js";
import { sealBundle, verifyBundle, type SealedBundle } from "../src/seal/bundle.js";
import { createCustodyChain, appendCustodyEvent } from "../src/seal/custody.js";
import { buildNarrativePrompt, narrate, type NarratorBackend } from "../src/narrative/narrator.js";
import { resolveNarrator } from "../src/narrative/backends.js";

function fakeBackend(name: string, model: string, respond: (prompt: string) => string): NarratorBackend {
  return { name, model, generate: async (prompt) => respond(prompt) };
}

function sealedFixture(): SealedBundle {
  const artifacts: Artifact[] = [
    {
      id: "n-log",
      type: "log",
      timestamp: "2026-08-07T14:20:00Z",
      source: "syslog",
      process: "rsyslogd",
      path: "/var/log/auth.log",
      entropyMilliBits: 4200,
      markers: ["log_cleared", "effect_before_cause"],
      description: "Auth log cleared inside the incident window.",
      provenanceChain: ["sha256:rootA"],
    },
    {
      id: "n-net",
      type: "network",
      timestamp: "2026-08-07T14:30:00Z",
      source: "pcap",
      process: "n/a",
      path: "conn://198.51.100.7:443",
      entropyMilliBits: 6900,
      markers: ["narrative_poisoning"],
      description: "Outbound transfer the host denies making.",
      provenanceChain: ["sha256:rootB"],
    },
  ];
  const detectorResults = runAllDetectors(artifacts);
  const scoreResult = score({
    detectorResults,
    artifacts,
    devilAdvocate: "A backup agent could explain the transfer.",
    custodyValid: true,
  });
  let chain = createCustodyChain("VELO-NARR-001");
  chain = appendCustodyEvent(chain, "ACQUIRED", "2026-08-07T14:00:00Z", "synthetic acquisition");
  return sealBundle("VELO-NARR-001", "2026-08-14T12:00:00Z", scoreResult, { caseId: "VELO-NARR-001", artifacts }, chain);
}

test("THE SWAP TEST: two different backends change only the wording, never the sealed result", async () => {
  const bundle = sealedFixture();
  const before = JSON.stringify(bundle);

  const local = fakeBackend("ollama", "llama3.2", () => `The engine sealed a ${bundle.verdict} verdict, briefly told.`);
  const hosted = fakeBackend("anthropic", "claude-opus-4-8", () => `A longer, warmer account of the same sealed ${bundle.verdict} finding.`);

  const a = await narrate(bundle, local);
  const b = await narrate(bundle, hosted);

  // The prose differs; everything anchored to the seal is identical.
  assert.notEqual(a.prose, b.prose);
  assert.equal(a.bundleHash, b.bundleHash);
  assert.equal(a.analysisFingerprint, b.analysisFingerprint);
  assert.equal(a.caseId, b.caseId);

  // The bundle itself is byte-identical after both narrations, and still verifies.
  assert.equal(JSON.stringify(bundle), before, "narration must not mutate the sealed bundle");
  const check = verifyBundle(bundle);
  assert.equal(check.internallyConsistent, true, check.reasons.join("; "));
});

test("the narrator sees only fixed figures, and the prompt says so", () => {
  const bundle = sealedFixture();
  const prompt = buildNarrativePrompt(bundle);
  assert.match(prompt, /FIXED/);
  assert.match(prompt, /sealed/i);
  assert.ok(prompt.includes(bundle.verdict));
  assert.ok(prompt.includes(bundle.score));
  assert.ok(prompt.includes(String(bundle.corroborationCount)));
});

test("a narration contradicting the sealed verdict is flagged, not corrected and not blocking", async () => {
  const bundle = sealedFixture();
  const rogue = fakeBackend("rogue", "test", () => "Actually this looks like NOISE to me, nothing to see here.");
  const record = await narrate(bundle, rogue);

  assert.notEqual(bundle.verdict, "NOISE", "fixture must seal a non-NOISE verdict for this test to bite");
  assert.equal(record.proseConsistentWithVerdict, false);
  assert.match(record.consistencyNote, /seal is authoritative/);
  // The record still exists and the seal is untouched — the guard annotates only.
  assert.equal(record.bundleHash, bundle.bundleHash);
  assert.equal(verifyBundle(bundle).internallyConsistent, true);
});

test("no narrator configured resolves to null, never to a throw (honest degradation)", () => {
  const saved = process.env["VELO_NARRATOR"];
  try {
    delete process.env["VELO_NARRATOR"];
    assert.equal(resolveNarrator(), null);
    process.env["VELO_NARRATOR"] = "something-unknown";
    assert.equal(resolveNarrator(), null);
    process.env["VELO_NARRATOR"] = "ollama";
    assert.equal(resolveNarrator()?.name, "ollama");
    process.env["VELO_NARRATOR"] = "anthropic";
    // Constructing the backend must not require credentials — only generate() does.
    assert.equal(resolveNarrator()?.name, "anthropic");
  } finally {
    if (saved === undefined) delete process.env["VELO_NARRATOR"];
    else process.env["VELO_NARRATOR"] = saved;
  }
});

test("a failing backend loses the prose, never the analysis", async () => {
  const bundle = sealedFixture();
  const broken = fakeBackend("broken", "none", () => {
    throw new Error("connection refused");
  });
  await assert.rejects(() => narrate(bundle, broken), /connection refused/);
  // The sealed bundle survives its narrator.
  assert.equal(verifyBundle(bundle).internallyConsistent, true);
});

test("no sealed-value producer imports the narrative layer (LLM out of the decision path)", () => {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const srcRoot = path.join(__dirname, "..", "..", "src");
  for (const dir of ["engine", "seal", "inference"]) {
    for (const file of readdirSync(path.join(srcRoot, dir)).filter((f) => f.endsWith(".ts"))) {
      const content = readFileSync(path.join(srcRoot, dir, file), "utf8");
      assert.ok(
        !content.includes("narrative/"),
        `${dir}/${file} imports the narrative layer — the LLM must stay out of the decision path`,
      );
    }
  }
});
