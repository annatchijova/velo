import type * as __compactRuntime from '@midnight-ntwrk/compact-runtime';

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
}

export type ImpureCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type ProvableCircuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
}

export type PureCircuits = {
}

export type Circuits<PS> = {
  registerCredential(context: __compactRuntime.CircuitContext<PS>,
                     leaf_0: Uint8Array): __compactRuntime.CircuitResults<PS, []>;
  proveCredential(context: __compactRuntime.CircuitContext<PS>,
                  attestationDate_0: bigint): __compactRuntime.CircuitResults<PS, []>;
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
