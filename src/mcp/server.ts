#!/usr/bin/env node
/**
 * VELO MCP server — the "wallet" interface. Same backend logic as the
 * (planned) HTML frontend, exposed so an agent can drive the flow
 * conversationally.
 *
 * Chain READS (chain_status, lookup_commitment) are live against the
 * contract deployed on Midnight preview: they need no wallet, no proving
 * keys and no fees. Chain WRITES (attest_case) and the disclosure tools
 * are still registered-but-pending, and return a clear error rather than
 * simulating an attestation that has not happened.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { artifactSchema, type Artifact } from "../engine/evidence.js";
import { getCase, listCases, narrateCase, preAnalyzeEvidence, sealCase, verifyCase } from "../core/operations.js";
import { buildSyntheticRegistry, checkCredentialAtCase, listPeritoCasesOp, secondOpinionDemo } from "../core/perito_operations.js";
import { CUSTODY_EVENT_TYPES } from "../seal/custody.js";
import { lookupCommitment, readOnChainLedger } from "../chain/read.js";

const server = new McpServer({ name: "velo", version: "0.1.0" });

/**
 * Red team F1: caseId reaches the filesystem as a path component, so it
 * is constrained at the boundary. Mirrors CASE_ID_PATTERN in store.ts —
 * both exist on purpose (schema is the boundary, store doesn't trust
 * callers).
 */
const caseIdSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._-]+$/, "caseId may only contain letters, digits, dot, underscore and hyphen");

/** Layer 6: perito identifiers are constrained at the boundary too. */
const peritoIdSchema = z
  .string()
  .regex(/^VELO-PERITO-\d{3}$/, "peritoId must look like VELO-PERITO-001");

// artifactSchema now lives in src/engine/evidence.ts (shared with the Layer 7
// case_commitment derivation so both strip identically — F6/F8).

// --- Wallet "balance view" ---
server.registerTool(
  "list_my_cases",
  {
    title: "List my cases",
    description: "List sealed cases — public status only (verdict, commitment, corroboration count). Never returns evidence.",
    inputSchema: {},
  },
  async () => ({
    content: [{ type: "text", text: JSON.stringify(listCases(), null, 2) }],
  }),
);

// --- Wallet "asset detail view" ---
server.registerTool(
  "get_case",
  {
    title: "Get case",
    description: "Get the public summary of one case by ID. Never returns the evidence manifest or custody chain detail.",
    inputSchema: { caseId: caseIdSchema },
  },
  async ({ caseId }) => {
    const summary = getCase(caseId);
    if (!summary) {
      return { content: [{ type: "text", text: `No case found with id ${caseId}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
  },
);

/**
 * Red team F13: custody events used to be fabricated inside seal_case
 * with new Date(), after the analysis, unconnected to any real
 * acquisition — and custodyValid was hardcoded true, making ABSTAIN
 * unreachable through the product's actual interface.
 *
 * Now the caller supplies the real custody history, and validity is
 * *derived* by verifying that chain, not asserted.
 */
const custodyEventSchema = z.object({
  eventType: z.enum(CUSTODY_EVENT_TYPES),
  timestamp: z.string().datetime({ offset: true }),
  detail: z.string(),
});

// --- Wallet "mint" ---
server.registerTool(
  "seal_case",
  {
    title: "Seal case",
    description:
      "Run the deterministic forensic engine on the given artifacts and seal the result locally. Never touches the network. " +
      "Supply the real custody history in custodyEvents: if it is absent or does not form a valid ISO 27037 sequence, the " +
      "verdict is ABSTAIN, because evidence without a chain of custody is inadmissible regardless of what it shows.",
    inputSchema: {
      caseId: caseIdSchema,
      artifacts: z.array(artifactSchema),
      devilAdvocate: z.string().default(""),
      custodyEvents: z.array(custodyEventSchema).default([]),
      coverageGaps: z
        .array(z.object({ expected: z.string(), reason: z.string() }))
        .default([])
        .describe(
          "Sources that should have been examined and were not. Declaring one turns a 'nothing found' " +
            "result into ABSTAIN: a negative finding is not supportable over evidence never available.",
        ),
    },
  },
  async ({ caseId, artifacts, devilAdvocate, custodyEvents, coverageGaps }) => {
    // Behaviour lives in src/core/operations.ts, shared with the HTTP
    // server, so the two interfaces cannot drift apart (red team F8).
    const result = sealCase({ caseId, artifacts: artifacts as Artifact[], devilAdvocate, custodyEvents, coverageGaps });
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// --- Wallet "block explorer" ---
server.registerTool(
  "verify_commitment",
  {
    title: "Verify commitment",
    description:
      "Check that a sealed case is internally consistent — its hashes recompute and its custody chain links hold. " +
      "This does NOT establish who produced the bundle or when: authenticity is anchored by the on-chain attestation (Capa 2, pending). " +
      "Anyone can call this, not just the case owner.",
    inputSchema: { caseId: caseIdSchema },
  },
  async ({ caseId }) => {
    const result = verifyCase(caseId);
    if (!result) {
      return { content: [{ type: "text", text: `No case found with id ${caseId}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "pre_analyze",
  {
    title: "Pre-analyze evidence",
    description:
      "Run the non-sealable signal producers (timing regularity ported from VIGIA jitter analysis; Grice quantity maxims " +
      "over optional texts) over candidate artifacts BEFORE sealing. Returns marker SUGGESTIONS (advisory - review them and, " +
      "if you agree, add the marker to the artifact before calling seal_case) and narrative signals (floats, never sealed). " +
      "Nothing here changes a verdict by itself: suggestions enter the engine only as regular input markers you choose to apply.",
    inputSchema: {
      artifacts: z.array(artifactSchema),
      texts: z.array(z.string()).default([]).describe("Optional free texts tied to the case (tickets, notes) for the Grice quantity pass."),
    },
  },
  async ({ artifacts, texts }) => {
    const result = preAnalyzeEvidence(artifacts as Artifact[], texts);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

server.registerTool(
  "narrate_case",
  {
    title: "Narrate sealed case",
    description:
      "Have the configured LLM narrator (VELO_NARRATOR=ollama or anthropic) put an ALREADY-SEALED case into plain prose. " +
      "The narrator runs strictly after sealing, receives a read-only summary, and its prose is stored beside the seal, " +
      "never inside it — swapping or removing the narrator changes wording only, never a verdict or a hash. " +
      "With no narrator configured this reports that honestly instead of failing.",
    inputSchema: { caseId: caseIdSchema },
  },
  async ({ caseId }) => {
    const result = await narrateCase(caseId);
    if (!result) {
      return { content: [{ type: "text", text: `No case found with id ${caseId}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
  },
);

// --- Chain reads: what the ledger actually says (no wallet, no proving) ---
server.registerTool(
  "chain_status",
  {
    title: "Chain status",
    description:
      "Read the deployed VELO contract's ledger on Midnight: how many attestations exist and which commitments carry which verdict. " +
      "Reports what is recorded on-chain — a commitment listed here was attested by someone, which is not the same as the analysis behind it being correct. " +
      "Needs no wallet, no proving keys and no fees, so it works even where attesting cannot.",
    inputSchema: {},
  },
  async () => {
    try {
      const ledger = await readOnChainLedger();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(
              { ...ledger, attestationCount: ledger.attestationCount.toString() },
              null,
              2,
            ),
          },
        ],
      };
    } catch (err) {
      // An unreachable indexer is not "zero attestations" — say which it is.
      return {
        content: [{ type: "text", text: err instanceof Error ? err.message : "Unknown error reading the chain" }],
        isError: true,
      };
    }
  },
);

server.registerTool(
  "lookup_commitment",
  {
    title: "Look up commitment on-chain",
    description:
      "Check whether a specific commitment has been attested on the Midnight ledger, and with what verdict. " +
      "Returns 'not attested' when absent — absence is an answer, not an error: every case is un-attested until it is attested.",
    inputSchema: {
      commitment: z
        .string()
        .regex(/^[0-9a-fA-F]{64}$/, "commitment must be 64 hex characters (32 bytes)"),
    },
  },
  async ({ commitment }) => {
    try {
      const found = await lookupCommitment(commitment);
      return {
        content: [
          {
            type: "text",
            text: found
              ? JSON.stringify({ attested: true, ...found }, null, 2)
              : JSON.stringify({ attested: false, commitment: commitment.toLowerCase() }, null, 2),
          },
        ],
      };
    } catch (err) {
      return {
        content: [{ type: "text", text: err instanceof Error ? err.message : "Unknown error reading the chain" }],
        isError: true,
      };
    }
  },
);

// --- Layer 6: perito credential (membership + validity) ---
server.registerTool(
  "check_credential_validity",
  {
    title: "Check perito credential validity at a case's attestation date",
    description:
      "Layer 6 validity half: given a perito and a case, decide whether that examiner's credential was VALID at the case's " +
      "attestation date (the ANALYZED custody event). Returns three states — VALID / INVALID / ABSTAIN (unknown date). " +
      "This is the check the synthetic corpus exercises: VELO-PERITO-005 is INVALID for VELO-006 (licensing gap) but VALID " +
      "for VELO-009 and VELO-010. Membership (that the examiner is accredited at all) is a separate check — see build_perito_registry.",
    inputSchema: { peritoId: peritoIdSchema, caseId: caseIdSchema },
  },
  async ({ peritoId, caseId }) => {
    const result = checkCredentialAtCase(peritoId, caseId);
    const isError = "error" in result;
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError };
  },
);

server.registerTool(
  "build_perito_registry",
  {
    title: "Build the accredited-examiners registry",
    description:
      "Layer 6 membership half: build the off-chain deterministic Merkle registry over the synthetic accredited peritos and " +
      "return its root and leaf count (one leaf per validity span). Contains NO secrets. This is a parallel audit structure to " +
      "the on-chain MerkleTree, not the same root — see docs/layer6-perito-credential.md. Per-perito secrets here are synthetic " +
      "and deterministic (demo only); a real deployment holds each secret in the encrypted vault.",
    inputSchema: {},
  },
  async () => ({ content: [{ type: "text", text: JSON.stringify(buildSyntheticRegistry(), null, 2) }] }),
);

server.registerTool(
  "list_perito_cases",
  {
    title: "List a perito's cases (own-vs-others visibility)",
    description:
      "The perito 'my cases' surface: cases the examiner attested with a VALID credential are shown in full; anyone else's case " +
      "is reduced to {case_id, name, expected_verdict, expected_corroboration_count} with no artifacts, devil_advocate, peirce_chain " +
      "or attesting alias; unclaimed cases appear in no examiner's list and are returned separately without a verdict.",
    inputSchema: { peritoId: peritoIdSchema },
  },
  async ({ peritoId }) => {
    const result = listPeritoCasesOp(peritoId);
    const isError = "error" in result;
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }], isError };
  },
);

// --- Layer 7: blind second opinion (commit-reveal + nullifier) ---
server.registerTool(
  "second_opinion_demo",
  {
    title: "Blind second opinion — run the commit-reveal protocol (demo)",
    description:
      "Run Layer 7 end to end off-chain over the corpus: VELO-PERITO-003 and VELO-PERITO-004 independently opine on VELO-005. " +
      "The timeline shows BOTH verdict commitments land before either is revealed (so neither examiner could copy the other), " +
      "ending in AGREE / MALICE. Never reveals identities — only the anonymous timeline and the agreement. Synthetic keys and " +
      "case_commitment (demo); the on-chain path is commit_opinion / reveal_opinion (compiled, write path pending).",
    inputSchema: { caseId: caseIdSchema.default("VELO-005") },
  },
  async ({ caseId }) => ({ content: [{ type: "text", text: JSON.stringify(secondOpinionDemo(caseId), null, 2) }] }),
);

// --- Pending on-chain integration (Capa 2) — registered honestly, not simulated ---
const pendingChainTool = (name: string, title: string, description: string) => {
  server.registerTool(
    name,
    { title, description: `${description} PENDING: requires the deployed Compact contract (Capa 2), not yet available.`, inputSchema: {} },
    async () => ({
      content: [{ type: "text", text: `${name} is not implemented yet — it depends on the Compact contract, which has not been compiled/deployed in this build.` }],
      isError: true,
    }),
  );
};

pendingChainTool("attest_case", "Attest case", "Publish commitment + ZK proof to Midnight. The contract IS deployed (see chain_status) but this write path is not wired yet.");
pendingChainTool("prove_credential", "Prove perito credential (Layer 6)", "Publish a ZK proof that some accredited, currently-valid examiner attests this case, without revealing which. The write path IS wired as a Bun CLI (deploy/prove-credential.ts, after deploy/deploy-perito-contract.ts + deploy/register-credential.ts) — it needs a wallet + seed + dust, so it is not driven from this MCP server, which has no wallet.");
pendingChainTool("commit_opinion", "Commit a blind second opinion (Layer 7)", "On-chain commit phase: publish a hiding verdict commitment + credential proof + nullifier. The commitOpinion circuit is compiled (keys generated); the wallet write path is not wired yet. Use second_opinion_demo to see the protocol off-chain.");
pendingChainTool("reveal_opinion", "Reveal a blind second opinion (Layer 7)", "On-chain reveal phase: open a previously committed verdict once both opinions are in. The revealOpinion circuit is compiled (keys generated); the wallet write path is not wired yet.");
pendingChainTool("list_disclosure_requests", "List disclosure requests", "List pending judge disclosure requests for my cases.");
pendingChainTool("approve_disclosure", "Approve disclosure", "Grant a specific judge's request for specific fields.");
pendingChainTool("deny_disclosure", "Deny disclosure", "Reject a judge's disclosure request.");

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
