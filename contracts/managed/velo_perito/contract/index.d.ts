import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

export enum Verdict { NOISE = 0, SUSPICION = 1, MALICE = 2, ABSTAIN = 3 }

export type Witnesses<PS> = {
  peritoLeafKey(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
  findCredentialPath(context: __compactRuntime.WitnessContext<Ledger, PS>,
                     leaf_0: Uint8Array): [PS, { leaf: Uint8Array,
                                                 path: { sibling: { field: bigint
                                                                  },
                                                         goes_left: boolean
                                                       }[]
                                               }];
  credentialValidFrom(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  credentialValidUntil(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, bigint];
  opinionVerdict(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Verdict];
  opinionNonce(context: __compactRuntime.WitnessContext<Ledger, PS>): [PS, Uint8Array];
}

export type ImpureCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                verdict_0: Verdict,
                nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                verdict_0: Verdict,
                nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  commitOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
  revealOpinion(context: __compactRuntime.CircuitContext<PS>,
                caseCommitment_0: Uint8Array,
                verdict_0: Verdict,
                nonce_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
}

export type Ledger = {
  accreditedPeritos: {
    isFull(): boolean;
    checkRoot(rt_0: { field: bigint }): boolean;
    root(): __compactRuntime.MerkleTreeDigest;
    firstFree(): bigint;
    pathForLeaf(index_0: bigint, leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array>;
    findPathForLeaf(leaf_0: Uint8Array): __compactRuntime.MerkleTreePath<Uint8Array> | undefined
  };
  readonly credentialAttestations: bigint;
  caseOpinions: {
    isEmpty(): boolean;
    size(): bigint;
    member(key_0: Uint8Array): boolean;
    lookup(key_0: Uint8Array): { commitCount: bigint,
                                 commitment0: Uint8Array,
                                 commitment1: Uint8Array,
                                 revealCount: bigint,
                                 verdict0: Verdict,
                                 verdict1: Verdict,
                                 revealed0: boolean,
                                 revealed1: boolean
                               };
    [Symbol.iterator](): Iterator<[Uint8Array, { commitCount: bigint,
  commitment0: Uint8Array,
  commitment1: Uint8Array,
  revealCount: bigint,
  verdict0: Verdict,
  verdict1: Verdict,
  revealed0: boolean,
  revealed1: boolean
}]>
  };
  usedOpinionNullifiers: {
    isEmpty(): boolean;
    size(): bigint;
    member(elem_0: Uint8Array): boolean;
    [Symbol.iterator](): Iterator<Uint8Array>
  };
  readonly secondOpinionCommits: bigint;
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
