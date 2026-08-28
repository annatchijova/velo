/**
 * TypeScript side of the Layer 6 circuit's private inputs
 * (contracts/velo_perito.compact).
 *
 * Mirrors src/witness/witnesses.ts discipline:
 *   - The leaf secret key is CSPRNG-generated ONCE per perito and persisted;
 *     if it is regenerated the credential leaf changes and the examiner is a
 *     different member of the tree (the "salt must survive" rule).
 *   - Bounded Compact integers cross into TypeScript as `bigint` regardless
 *     of how small their range is. `Uint<0..4294967296>` still arrives as a
 *     bigint, so the epoch witnesses return bigint, and the range is checked
 *     at THIS boundary where the error can still explain itself.
 *   - The in-circuit leaf key derivation (persistentHash/pad) is NOT
 *     recomputed here — its encoding is not exported from the runtime, and a
 *     guessed encoding "would look correct everywhere and never match what the
 *     circuit publishes" (witnesses.ts).
 *
 * RECONCILED against the generated bindings (compact 0.5.1, 2026-08-28,
 * contracts/managed/velo_perito/contract/index.d.ts). The compiled
 * `Witnesses<PS>` is exactly:
 *   peritoLeafKey(ctx): [PS, Uint8Array]
 *   findCredentialPath(ctx, leaf): [PS, { leaf, path: {sibling:{field},goes_left}[] }]
 *   credentialValidFrom(ctx): [PS, bigint]
 *   credentialValidUntil(ctx): [PS, bigint]
 * The bodies below match that shape. The ledger and path types are still kept
 * loose (`any`/`unknown`) rather than importing build output into source —
 * the same choice witnesses.ts makes for its ledger parameter; the generated
 * `findPathForLeaf` returns the `MerkleTreePath` object this expects.
 *
 * STILL NOT observed: no live proving session has been run against these
 * witnesses — the shapes match; behaviour under a real proof has not been
 * seen.
 */

import { randomBytes } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
import { bytes32ToHex, hexToBytes32, WitnessError, type Bytes32 } from "./witnesses.js";
import type { ValiditySpan } from "../perito/credential.js";

const LEAF_SECRET_BYTES = 32;

/** Exclusive upper bound of the circuit's `Uint<0..4294967296>` epoch type. */
const MAX_EPOCH_EXCLUSIVE = 4294967296; // 2^32 — ~year 2106, a ceiling with headroom.

/**
 * Per-perito private state: perito_id -> leaf secret key (hex). Never leaves
 * the examiner's machine. Same doctrine as VeloPrivateState.salts.
 */
export interface PeritoPrivateState {
  leafSecretKeys: Record<string, string>;
}

export function emptyPeritoPrivateState(): PeritoPrivateState {
  return { leafSecretKeys: {} };
}

/**
 * Get the perito's leaf secret key, generating and recording one on first
 * use. Returns the (possibly updated) state so persistence stays the
 * caller's decision — where the examiner's private state lives is a
 * deployment question, not an engine one.
 */
export function getOrCreateLeafKey(state: PeritoPrivateState, peritoId: string): { state: PeritoPrivateState; leafKey: Bytes32 } {
  const existing = state.leafSecretKeys[peritoId];
  if (existing) {
    return { state, leafKey: hexToBytes32(existing, `leafSecretKey for ${peritoId}`) };
  }
  const leafKey = new Uint8Array(randomBytes(LEAF_SECRET_BYTES));
  return {
    state: { ...state, leafSecretKeys: { ...state.leafSecretKeys, [peritoId]: bytes32ToHex(leafKey) } },
    leafKey,
  };
}

/**
 * Epoch seconds to the circuit's bounded integer, as bigint, range-checked.
 * A value outside `0..MAX_EPOCH_EXCLUSIVE` would fail the runtime cast inside
 * the circuit or wrap; reject it here where the error names the field.
 */
export function checkEpochBound(epochSeconds: number, fieldName: string): bigint {
  if (!Number.isSafeInteger(epochSeconds) || epochSeconds < 0) {
    throw new WitnessError(`${fieldName}: expected a non-negative integer epoch, got ${epochSeconds}`);
  }
  if (epochSeconds >= MAX_EPOCH_EXCLUSIVE) {
    throw new WitnessError(
      `${fieldName}: epoch ${epochSeconds} is outside the circuit's Uint<0..${MAX_EPOCH_EXCLUSIVE}> bound — widen the witness type in contracts/velo_perito.compact first`,
    );
  }
  return BigInt(epochSeconds);
}

/**
 * The witness object the generated Contract constructor will take, for one
 * proving session (one perito, one covering span). The leaf key comes from
 * private state; the window bounds are the covering span selected off-circuit
 * (registry.ts credentialProof); findCredentialPath reads the path from the
 * on-chain tree.
 *
 * Ledger and path types are `any` until the managed bindings exist — see the
 * module header.
 */
export function makePeritoWitnesses(peritoId: string, span: ValiditySpan): PeritoWitnesses {
  const validFrom = checkEpochBound(span.validFromEpoch, `${peritoId} span.validFrom`);
  const validUntil = checkEpochBound(span.validUntilEpoch, `${peritoId} span.validUntil`);

  return {
    peritoLeafKey: ({ privateState }: WitnessContext<any, PeritoPrivateState>) => {
      const { state, leafKey } = getOrCreateLeafKey(privateState, peritoId);
      return [state, leafKey];
    },
    credentialValidFrom: ({ privateState }: WitnessContext<any, PeritoPrivateState>) => [privateState, validFrom],
    credentialValidUntil: ({ privateState }: WitnessContext<any, PeritoPrivateState>) => [privateState, validUntil],
    findCredentialPath: (context: WitnessContext<any, PeritoPrivateState>, leaf: Uint8Array) => {
      // The generated ledger exposes findPathForLeaf on the tree field; typed
      // loosely until managed bindings exist.
      const path = (context.ledger as any).accreditedPeritos.findPathForLeaf(leaf);
      if (path === undefined || path === null) {
        throw new WitnessError(`findCredentialPath: no path for the supplied leaf — the credential is not in the accredited tree`);
      }
      return [context.privateState, path];
    },
  };
}

export interface PeritoWitnesses {
  peritoLeafKey(context: WitnessContext<any, PeritoPrivateState>): [PeritoPrivateState, Uint8Array];
  credentialValidFrom(context: WitnessContext<any, PeritoPrivateState>): [PeritoPrivateState, bigint];
  credentialValidUntil(context: WitnessContext<any, PeritoPrivateState>): [PeritoPrivateState, bigint];
  findCredentialPath(context: WitnessContext<any, PeritoPrivateState>, leaf: Uint8Array): [PeritoPrivateState, unknown];
}
