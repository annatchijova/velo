#!/usr/bin/env node
/**
 * VELO MCP server — the "wallet" interface. Same backend logic as the
 * (planned) HTML frontend, exposed so an agent can drive the flow
 * conversationally. Tools that need the deployed Compact contract
 * (attest_case, disclosure_*) are registered but return a clear pending
 * error until Capa 2 exists — no simulated chain interaction.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { runAllDetectors } from "../engine/detectors.js";
import type { Artifact } from "../engine/evidence.js";
import { score } from "../engine/scorer.js";
import { sealBundle, verifyBundle } from "../seal/bundle.js";
import { createCustodyChain, appendCustodyEvent } from "../seal/custody.js";
import { listBundles, loadBundle, saveBundle, toSummary } from "./store.js";

const server = new McpServer({ name: "velo", version: "0.1.0" });

const artifactSchema = z.object({
  id: z.string(),
  type: z.enum(["file", "process", "log", "network", "registry", "dns_record"]),
  timestamp: z.string(),
  source: z.string(),
  process: z.string(),
  path: z.string(),
  entropyMilliBits: z.number().int(),
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
    content: [{ type: "text", text: JSON.stringify(listBundles(), null, 2) }],
  }),
);

// --- Wallet "asset detail view" ---
server.registerTool(
  "get_case",
  {
    title: "Get case",
    description: "Get the public summary of one case by ID. Never returns the evidence manifest or custody chain detail.",
    inputSchema: { caseId: z.string() },
  },
  async ({ caseId }) => {
    const bundle = loadBundle(caseId);
    if (!bundle) {
      return { content: [{ type: "text", text: `No case found with id ${caseId}` }], isError: true };
    }
    return { content: [{ type: "text", text: JSON.stringify(toSummary(bundle), null, 2) }] };
  },
);

// --- Wallet "mint" ---
server.registerTool(
  "seal_case",
  {
    title: "Seal case",
    description:
      "Run the deterministic forensic engine on the given artifacts and seal the result locally. Never touches the network.",
    inputSchema: {
      caseId: z.string(),
      artifacts: z.array(artifactSchema),
      devilAdvocate: z.string().default(""),
    },
  },
  async ({ caseId, artifacts, devilAdvocate }) => {
    const detectorResults = runAllDetectors(artifacts as Artifact[]);
    const scoreResult = score({ detectorResults, devilAdvocate, custodyValid: true });

    let chain = createCustodyChain(caseId);
    chain = appendCustodyEvent(chain, "IDENTIFIED", new Date().toISOString(), `evidence identified for ${caseId}`);
    chain = appendCustodyEvent(chain, "ANALYZED", new Date().toISOString(), "deterministic engine ran");

    const manifest = { caseId, artifacts: artifacts as Artifact[] };
    const bundle = sealBundle(caseId, new Date().toISOString(), scoreResult, manifest, chain);
    const path = saveBundle(bundle);

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({ savedTo: path, summary: toSummary(bundle), reasoning: scoreResult.reasoning }, null, 2),
        },
      ],
    };
  },
);

// --- Wallet "block explorer" ---
server.registerTool(
  "verify_commitment",
  {
    title: "Verify commitment",
    description: "Verify that a sealed case's bundle hash and analysis fingerprint are internally consistent and untampered. Anyone can call this, not just the case owner.",
    inputSchema: { caseId: z.string() },
  },
  async ({ caseId }) => {
    const bundle = loadBundle(caseId);
    if (!bundle) {
      return { content: [{ type: "text", text: `No case found with id ${caseId}` }], isError: true };
    }
    const result = verifyBundle(bundle);
    return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
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

pendingChainTool("attest_case", "Attest case", "Publish commitment + ZK proof to Midnight testnet.");
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
