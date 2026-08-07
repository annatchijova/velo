import { createHash } from "node:crypto";
import { canonicalize } from "./canonical.js";

/**
 * Closed vocabulary of custody events, adapted from ISO/IEC 27037:2012's
 * four named processes (Identification, Collection, Acquisition,
 * Preservation), plus two events ISO doesn't anticipate because it doesn't
 * cover cryptographic sealing or ZK attestation.
 */
export const CUSTODY_EVENT_TYPES = [
  "IDENTIFIED",
  "COLLECTED",
  "ACQUIRED",
  "PRESERVED",
  "ANALYZED",
  "SEALED",
] as const;

export type CustodyEventType = (typeof CUSTODY_EVENT_TYPES)[number];

export interface CustodyEvent {
  seq: number;
  eventType: CustodyEventType;
  timestamp: string;
  detail: string;
  prevHash: string;
  entryHash: string;
}

export interface CustodyChain {
  caseId: string;
  genesisHash: string;
  events: CustodyEvent[];
}

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

export function genesisHash(caseId: string): string {
  return sha256Hex(`VELO_GENESIS:${caseId}`);
}

export function createCustodyChain(caseId: string): CustodyChain {
  return { caseId, genesisHash: genesisHash(caseId), events: [] };
}

export function appendCustodyEvent(
  chain: CustodyChain,
  eventType: CustodyEventType,
  timestamp: string,
  detail: string,
): CustodyChain {
  const prevHash = chain.events.length === 0 ? chain.genesisHash : chain.events[chain.events.length - 1]!.entryHash;
  const seq = chain.events.length;
  const entryHash = sha256Hex(
    canonicalize({ seq, eventType, timestamp, detail, prevHash }),
  );
  const event: CustodyEvent = { seq, eventType, timestamp, detail, prevHash, entryHash };
  return { ...chain, events: [...chain.events, event] };
}

/** The tip of the chain — anti-truncation: a truncated copy has a different tip than the original. */
export function chainTip(chain: CustodyChain): string {
  if (chain.events.length === 0) return chain.genesisHash;
  return chain.events[chain.events.length - 1]!.entryHash;
}

export interface CustodyVerification {
  valid: boolean;
  reason: string;
}

/** Recomputes every link independently — does not trust any hash stored in the chain itself. */
export function verifyCustodyChain(chain: CustodyChain): CustodyVerification {
  const expectedGenesis = genesisHash(chain.caseId);
  if (chain.genesisHash !== expectedGenesis) {
    return { valid: false, reason: "Genesis hash does not match case ID — chain was not created honestly for this case." };
  }

  let prevHash = chain.genesisHash;
  for (const event of chain.events) {
    if (event.prevHash !== prevHash) {
      return { valid: false, reason: `Broken link at seq ${event.seq}: prevHash does not match the actual previous entry.` };
    }
    const expectedEntryHash = sha256Hex(
      canonicalize({ seq: event.seq, eventType: event.eventType, timestamp: event.timestamp, detail: event.detail, prevHash: event.prevHash }),
    );
    if (event.entryHash !== expectedEntryHash) {
      return { valid: false, reason: `Tampered entry at seq ${event.seq}: stored hash does not match recomputed hash.` };
    }
    prevHash = event.entryHash;
  }

  return { valid: true, reason: "All links verified independently." };
}
