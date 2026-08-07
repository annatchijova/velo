import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Verdict { NOISE = 0, SUSPICION = 1, MALICE = 2, ABSTAIN = 3 }

export type Witnesses<PS> = {
  bundleFingerprint(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  bundleSalt(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  custodyTip(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  corroborationCountWitness(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
}

export type ImpureCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  lookupVerdict(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Verdict>;
}

export type ProvableCircuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  lookupVerdict(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Verdict>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  attest(context: __compactRuntime.CircuitContext<PS>, verdict_0: Verdict): __compactRuntime.CircuitResults<PS, []>;
  lookupVerdict(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array): __compactRuntime.CircuitResults<PS, Verdict>;
}

export type Ledger = {
  caseVerdicts: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): Verdict;
    [Symbol.iterator](): Iterator<[Uint8Array, Verdict]>
  };
  readonly attestationCount: bigint;
}

export type ContractReferenceLocations = any;

export declare const contractReferenceLocations : ContractReferenceLocations;

export declare class Contract<PS = any, W extends Witnesses<PS> = Witnesses<PS>> {
  witnesses: W;
  circuits: Circuits<PS>;
  impureCircuits: ImpureCircuits<PS>;
  provableCircuits: ProvableCircuits<PS>;
  constructor(witnesses: W);
  initialState(context: __compactRuntime.ConstructorContext<PS>): __compactRuntime.ConstructorResult<PS>;
}

export declare function ledger(state: __compactRuntime.StateValue | __compactRuntime.ChargedState): Ledger;
export declare const pureCircuits: PureCircuits;
