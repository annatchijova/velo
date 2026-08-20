import { getEnv } from "../src/core/env.js";

/**
 * VELO targets Preview as its official network — not Preprod, which is
 * what earlier local experimentation had defaulted to.
 *
 * MIDNIGHT_NETWORK_ID must be set as a real environment variable on the
 * command line (`MIDNIGHT_NETWORK_ID=preview bun run deploy/deploy-contract.ts`),
 * not defaulted inside this file: `midnightNetworkConfig`, re-exported
 * below from `@effectstream/midnight-contracts/midnight-env` (a
 * published third-party package), reads `process.env.MIDNIGHT_NETWORK_ID`
 * at that module's own top-level evaluation time. ES module imports are
 * hoisted and evaluated before any of this file's own executable
 * statements run, so setting the env var here — after the import — is
 * too late; it defaults to "undeployed" (a local-only node) regardless.
 */
if (!getEnv("MIDNIGHT_NETWORK_ID")) {
  throw new Error(
    "MIDNIGHT_NETWORK_ID is not set. Run with: MIDNIGHT_NETWORK_ID=preview bun run deploy/deploy-contract.ts " +
      "(setting it inside this module would be too late — see the comment above).",
  );
}

export { midnightNetworkConfig } from "@effectstream/midnight-contracts/midnight-env";

/**
 * Red team F17: this used to fall back to a hardcoded
 * "velo-local-dev-password-16" when MIDNIGHT_STORAGE_PASSWORD wasn't set —
 * committed to a public repo, and (per @effectstream/midnight-contracts'
 * providers.ts) it's what encrypts the local signing-key store at rest,
 * not a throwaway namespace string. No doc ever told an operator to set
 * the real env var, so the insecure default was the de facto path, same
 * failure shape as the MIDNIGHT_NETWORK_ID check above: fail closed
 * instead of silently substituting a public value into something meant
 * to protect key material.
 */
if (!getEnv("MIDNIGHT_STORAGE_PASSWORD")) {
  throw new Error(
    "MIDNIGHT_STORAGE_PASSWORD is not set. This encrypts the local signing-key store at rest -- " +
      "pick a real secret, set it as an env var, and never commit it. " +
      "Run with: MIDNIGHT_NETWORK_ID=preview MIDNIGHT_STORAGE_PASSWORD=<your-secret> bun run deploy/deploy-contract.ts",
  );
}

export const storagePassword: string = getEnv("MIDNIGHT_STORAGE_PASSWORD")!;
