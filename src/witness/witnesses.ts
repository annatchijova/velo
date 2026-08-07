import { randomBytes } from "node:crypto";
import type { SealedBundle } from "../seal/bundle.js";
import { attestationPayload } from "../seal/bundle.js";

/**
 * TypeScript side of the Compact circuit's private inputs.
 *
 * contracts/velo.compact declares four witnesses whose bodies live here:
 *   witness bundleFingerprint(): Bytes<32>
 *   witness custodyTip(): Bytes<32>
 *   witness bundleSalt(): Bytes<32>
 *   witness corroborationCountWitness(): Uint<0..17>
 *
 * None of these values ever reaches the ledger. The circuit proves
 * statements *about* them; only the resulting commitment and the declared
 * verdict are published.
 *
 * NOT VERIFIED AGAINST THE COMPILER: the contract has never been
 * compiled (no Compact toolchain on the machine this was written on), so
 * the generated TypeScript bindings do not exist yet. The types below are
 * written structurally against the documented witness contract, not
 * imported from generated code. Expect to reconcile the exact
 * WitnessContext shape and the Uint<0..17> representation (number vs
 * bigint) at first compile. Everything else here — the salt lifecycle,
 * the hex/byte conversion, the validation — is independent of that and
 * is unit-tested.
 */

const BYTES_32 = 32;

/** A 32-byte value as the circuit wants it. */
export type Bytes32 = Uint8Array;

/**
 * Per-case private state. The salt is the one value that is generated
 * here rather than derived from the bundle, and it must survive: without
 * the exact salt, the prover can never reproduce the commitment for that
 * case, and the attestation becomes unverifiable by its own author.
 */
export interface VeloPrivateState {
  /** caseId -> salt, hex-encoded. Never leaves the expert's machine. */
  salts: Record<string, string>;
}

export function emptyPrivateState(): VeloPrivateState {
  return { salts: {} };
}

export class WitnessError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WitnessError";
  }
}

/**
 * Hex string to fixed-width bytes, validated. A hash that is the wrong
 * length or contains non-hex characters means something upstream is
 * broken; padding or truncating it would push a corrupt value into a
 * proof that would then be perfectly valid about the wrong thing.
 */
export function hexToBytes32(hex: string, fieldName: string): Bytes32 {
  if (typeof hex !== "string" || !/^[0-9a-fA-F]+$/.test(hex)) {
    throw new WitnessError(`${fieldName}: expected a hex string, got ${JSON.stringify(hex)}`);
  }
  if (hex.length !== BYTES_32 * 2) {
    throw new WitnessError(
      `${fieldName}: expected ${BYTES_32 * 2} hex characters (${BYTES_32} bytes), got ${hex.length}`,
    );
  }
  const out = new Uint8Array(BYTES_32);
  for (let i = 0; i < BYTES_32; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export function bytes32ToHex(bytes: Bytes32): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Fresh 32-byte salt from a CSPRNG.
 *
 * Reusing a salt across two commitments is a privacy failure, not a
 * performance detail: two attestations of the same fingerprint with the
 * same salt produce byte-identical commitments on a public ledger, which
 * silently reveals that two cases share an analysis. The salt is
 * generated once per case and then reused *only* for that same case, so
 * re-proving the same attestation stays possible.
 */
export function getOrCreateSalt(state: VeloPrivateState, caseId: string): { state: VeloPrivateState; salt: Bytes32 } {
  const existing = state.salts[caseId];
  if (existing) {
    return { state, salt: hexToBytes32(existing, `salt for ${caseId}`) };
  }
  const salt = new Uint8Array(randomBytes(BYTES_32));
  return {
    state: { ...state, salts: { ...state.salts, [caseId]: bytes32ToHex(salt) } },
    salt,
  };
}

/**
 * Upper bound from the contract's `Uint<0..17>`. A count outside the
 * range would either fail the runtime cast inside the circuit or, worse,
 * wrap — so it is rejected here, where the error can still say what went
 * wrong.
 */
const MAX_CORROBORATION = 17;

export function checkCorroborationCount(count: number): number {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new WitnessError(`corroborationCount must be a non-negative integer, got ${count}`);
  }
  if (count > MAX_CORROBORATION) {
    throw new WitnessError(
      `corroborationCount ${count} exceeds the circuit's Uint<0..${MAX_CORROBORATION}> bound — ` +
        `widen the witness type in contracts/velo.compact before allowing this many independent sources`,
    );
  }
  return count;
}

/** The four private values one attestation needs. */
export interface AttestationWitnesses {
  bundleFingerprint: Bytes32;
  custodyTip: Bytes32;
  bundleSalt: Bytes32;
  corroborationCount: number;
}

/**
 * Derives every witness value for a sealed bundle, and returns the
 * private state to persist (it may now contain a newly generated salt).
 *
 * Pure apart from salt generation, and the salt is returned rather than
 * written anywhere — persistence is the caller's decision, because where
 * the expert's private state lives is a deployment question, not an
 * engine one.
 */
export function witnessesForBundle(
  state: VeloPrivateState,
  bundle: SealedBundle,
): { state: VeloPrivateState; witnesses: AttestationWitnesses } {
  const payload = attestationPayload(bundle);
  const { state: nextState, salt } = getOrCreateSalt(state, bundle.caseId);

  return {
    state: nextState,
    witnesses: {
      bundleFingerprint: hexToBytes32(payload.analysisFingerprint, "analysisFingerprint"),
      custodyTip: hexToBytes32(payload.custodyTip, "custodyTip"),
      bundleSalt: salt,
      corroborationCount: checkCorroborationCount(bundle.corroborationCount),
    },
  };
}

/**
 * Shape the Midnight runtime is expected to call — one function per
 * declared witness, each receiving the private state and returning the
 * value.
 *
 * The real WitnessContext type comes from the generated bindings, which
 * do not exist until the contract compiles. `context` is typed loosely
 * here on purpose rather than guessed at precisely: a wrong-but-specific
 * type would look verified when it is not.
 */
export function makeWitnessImplementations(bundle: SealedBundle) {
  return {
    bundleFingerprint: ({ privateState }: { privateState: VeloPrivateState }) => {
      const { state, witnesses } = witnessesForBundle(privateState, bundle);
      return [state, witnesses.bundleFingerprint] as const;
    },
    custodyTip: ({ privateState }: { privateState: VeloPrivateState }) => {
      const { state, witnesses } = witnessesForBundle(privateState, bundle);
      return [state, witnesses.custodyTip] as const;
    },
    bundleSalt: ({ privateState }: { privateState: VeloPrivateState }) => {
      const { state, witnesses } = witnessesForBundle(privateState, bundle);
      return [state, witnesses.bundleSalt] as const;
    },
    corroborationCountWitness: ({ privateState }: { privateState: VeloPrivateState }) => {
      const { state, witnesses } = witnessesForBundle(privateState, bundle);
      return [state, witnesses.corroborationCount] as const;
    },
  };
}
