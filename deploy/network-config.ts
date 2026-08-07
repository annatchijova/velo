import { getEnv } from "../src/core/env.js";

/**
 * VELO targets the Hack Buenos Aires hackathon's official network —
 * confirmed as Preview in the kickoff talk (Jay Albert), not Preprod,
 * which is what earlier local experimentation had defaulted to.
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

export const storagePassword: string = getEnv("MIDNIGHT_STORAGE_PASSWORD") || "velo-local-dev-password-16";
