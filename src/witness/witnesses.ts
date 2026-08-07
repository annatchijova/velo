import { randomBytes } from "node:crypto";
import type { WitnessContext } from "@midnight-ntwrk/compact-runtime";
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
 * All four are hashed into the commitment (together with the public
 * verdict and a domain separator). That matters for the count in
 * particular: it stays private — how many sources corroborate is itself
 * information about the case — while still being fixed at the moment the
 * commitment is published. It cannot be re-chosen later to make a
 * different verdict pass the Daubert gate.
 *
 * VERIFIED AGAINST THE GENERATED BINDINGS (compact 0.31.1, 2026-08-07).
 * `WitnessContext` is imported from `@midnight-ntwrk/compact-runtime`
 * rather than guessed at. Reconciling with the real API caught one
 * genuine mismatch: `corroborationCountWitness` returns a **bigint**,
 * not a number — Compact integers cross into TypeScript as bigint no
 * matter how small their declared range. That error typechecked
 * perfectly on its own and would only have surfaced when wired to the
 * contract.
 *
 * Still NOT verified: nothing here has been run against a live circuit.
 * The shapes match; the behaviour under a real proof has not been
 * observed.
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

export function checkCorroborationCount(count: number): bigint {
  if (!Number.isSafeInteger(count) || count < 0) {
    throw new WitnessError(`corroborationCount must be a non-negative integer, got ${count}`);
  }
  if (count > MAX_CORROBORATION) {
    throw new WitnessError(
      `corroborationCount ${count} exceeds the circuit's Uint<0..${MAX_CORROBORATION}> bound — ` +
        `widen the witness type in contracts/velo.compact before allowing this many independent sources`,
    );
  }
  return BigInt(count);
}

/**
 * The four private values one attestation needs.
 *
 * `corroborationCount` is a **bigint**, not a number: the generated
 * bindings type `corroborationCountWitness` as returning
 * `[PS, bigint]`. Compact's integers map to bigint in TypeScript
 * regardless of how small their declared range is, so `Uint<0..17>`
 * still crosses the boundary as a bigint. This was a real mismatch in
 * the first version of this file — it typechecked fine on its own and
 * would only have failed when wired to the actual contract.
 */
export interface AttestationWitnesses {
  bundleFingerprint: Bytes32;
  custodyTip: Bytes32;
  bundleSalt: Bytes32;
  corroborationCount: bigint;
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
 * The witness object the generated `Contract` constructor takes.
 *
 * Matches the shape the compiler emitted in
 * `contracts/managed/velo/contract/index.d.ts`:
 *
 *   export type Witnesses<PS> = {
 *     bundleFingerprint(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
 *     bundleSalt(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
 *     custodyTip(context: WitnessContext<Ledger, PS>): [PS, Uint8Array];
 *     corroborationCountWitness(context: WitnessContext<Ledger, PS>): [PS, bigint];
 *   }
 *
 * `Ledger` is generated per-contract, so `WitnessContext`'s ledger
 * parameter is left at its `any` default here rather than importing
 * build output into source — none of these witnesses reads the ledger.
 *
 * The bundle is captured by closure rather than stored in private state:
 * an attestation is about one specific sealed bundle, and threading it
 * through the private state would make it possible to attest bundle A
 * while the state still points at bundle B.
 */
export function makeWitnesses(bundle: SealedBundle): VeloWitnesses {
  const forBundle = (privateState: VeloPrivateState) => witnessesForBundle(privateState, bundle);

  return {
    bundleFingerprint: ({ privateState }: WitnessContext<any, VeloPrivateState>) => {
      const { state, witnesses } = forBundle(privateState);
      return [state, witnesses.bundleFingerprint];
    },
    bundleSalt: ({ privateState }: WitnessContext<any, VeloPrivateState>) => {
      const { state, witnesses } = forBundle(privateState);
      return [state, witnesses.bundleSalt];
    },
    custodyTip: ({ privateState }: WitnessContext<any, VeloPrivateState>) => {
      const { state, witnesses } = forBundle(privateState);
      return [state, witnesses.custodyTip];
    },
    corroborationCountWitness: ({ privateState }: WitnessContext<any, VeloPrivateState>) => {
      const { state, witnesses } = forBundle(privateState);
      return [state, witnesses.corroborationCount];
    },
  };
}

export interface VeloWitnesses {
  bundleFingerprint(context: WitnessContext<any, VeloPrivateState>): [VeloPrivateState, Uint8Array];
  bundleSalt(context: WitnessContext<any, VeloPrivateState>): [VeloPrivateState, Uint8Array];
  custodyTip(context: WitnessContext<any, VeloPrivateState>): [VeloPrivateState, Uint8Array];
  corroborationCountWitness(context: WitnessContext<any, VeloPrivateState>): [VeloPrivateState, bigint];
}

/**
 * The commitment is NOT computed here, on purpose.
 *
 * `@midnight-ntwrk/compact-runtime` does expose `persistentHash`, so it
 * would be possible — but reproducing the circuit's exact preimage also
 * requires reproducing `pad(32, "velo:attestation:v1")` and the
 * `Field -> Bytes<32>` cast byte-for-byte, and neither encoding is
 * exported or documented. A commitment computed from a guessed encoding
 * would be worse than none: it would look correct everywhere and simply
 * never match what the circuit publishes.
 *
 * The commitment is read from the circuit's own output instead. If an
 * off-circuit version is ever needed, verify it against a real circuit
 * run before trusting a single byte of it.
 */
