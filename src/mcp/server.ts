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
import type { Artifact } from "../engine/evidence.js";
import { getCase, listCases, sealCase, verifyCase } from "../core/operations.js";
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

/**
 * Red team F6: an unparseable timestamp used to silence the temporal
 * detector (NaN comparisons are always false). Rejected at the edge now;
 * the detector also fails closed independently.
 */
const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "process", "log", "network", "registry", "dns_record"]),
  timestamp: z.string().datetime({ offset: true }),
  source: z.string(),
  process: z.string(),
  path: z.string(),
  entropyMilliBits: z.number().int().safe(),
  markers: z.array(z.string()),
  description: z.string(),
  provenanceChain: z.array(z.string()),
});

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
    },
  },
  async ({ caseId, artifacts, devilAdvocate, custodyEvents }) => {
    // Behaviour lives in src/core/operations.ts, shared with the HTTP
    // server, so the two interfaces cannot drift apart (red team F8).
    const result = sealCase({ caseId, artifacts: artifacts as Artifact[], devilAdvocate, custodyEvents });
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
