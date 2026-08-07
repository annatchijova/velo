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

/**
 * Recomputes every link independently — does not trust any hash stored in
 * the chain itself.
 *
 * KNOWN LIMITATION, not a bug: this function CANNOT detect truncation —
 * an attacker who removes events from the END of an honest chain and
 * hands you the shortened result gets a chain that is internally
 * consistent, because every link that remains still recomputes correctly.
 * No hash-chain-in-isolation can prove a negative ("nothing was removed
 * after this point") without an external, independently-trusted anchor
 * to compare against. See tests/pipeline.test.ts for a test that
 * demonstrates this directly.
 *
 * The actual anti-truncation property VELO relies on is NOT this
 * function — it's the on-chain commitment (Capa 2). Once a bundle's
 * commitment is attested on Midnight, that record is immutable; a
 * verifier who checks a LOCAL bundle.json against the ON-CHAIN
 * commitment/bundleHash *will* catch a locally-truncated-then-touched-up
 * copy, because the attacker cannot also rewrite what's already public
 * on the ledger. Ledger immutability is the anchor. Do not describe this
 * local chain as truncation-proof by itself in the pitch — say
 * specifically that the ledger commitment is what anchors it.
 */
export function verifyCustodyChain(chain: CustodyChain): CustodyVerification {
  const expectedGenesis = genesisHash(chain.caseId);
  if (chain.genesisHash !== expectedGenesis) {
    return { valid: false, reason: "Genesis hash does not match case ID — chain was not created honestly for this case." };
  }

  let prevHash = chain.genesisHash;
  let previousTimestampMs: number | null = null;

  for (const [index, event] of chain.events.entries()) {
    // Red team F7: the closed vocabulary above was a TypeScript type and a
    // comment — both of which vanish at runtime. A chain with
    // eventType "EVENTO_INVENTADO", seq 0/1/42 and reverse-chronological
    // timestamps verified clean. A closed vocabulary has to be a
    // construction of the system, not prose about it.
    if (!(CUSTODY_EVENT_TYPES as readonly string[]).includes(event.eventType)) {
      return {
        valid: false,
        reason: `Unknown event type ${JSON.stringify(event.eventType)} at seq ${event.seq} — not in the closed ISO 27037 vocabulary.`,
      };
    }
    if (event.seq !== index) {
      return { valid: false, reason: `Non-consecutive seq at position ${index}: found ${event.seq}.` };
    }

    const timestampMs = new Date(event.timestamp).getTime();
    if (Number.isNaN(timestampMs)) {
      return { valid: false, reason: `Unparseable timestamp ${JSON.stringify(event.timestamp)} at seq ${event.seq}.` };
    }
    if (previousTimestampMs !== null && timestampMs < previousTimestampMs) {
      return {
        valid: false,
        reason: `Timestamp at seq ${event.seq} precedes the previous event — custody cannot run backwards.`,
      };
    }
    previousTimestampMs = timestampMs;

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
