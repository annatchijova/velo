import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // `velo` ships pre-compiled ESM (dist/) and must stay OUT of the webpack
  // server bundle — see the webpack() externals below for why. All velo
  // imports are server-side (API routes), so nothing needs it client-side.
  // Monorepo: trace files from the repo root, not from frontend/. Without
  // this, Vercel's nft cannot see the workspace package or the files loaded
  // through runtime-computed paths.
  outputFileTracingRoot: join(dirname(fileURLToPath(import.meta.url)), ".."),
  // Files loaded at request time through runtime-computed paths that nft
  // cannot discover on its own (repoRoot() walk-up + dynamic import). See
  // ADR-005 and the "chain reads fail on Vercel" risk in the MVP plan.
  outputFileTracingIncludes: {
    "/api/chain": [
      "contracts/velo.compact",
      "contracts/managed/**",
      "deploy/managed-shim/*.json",
    ],
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // serverExternalPackages does not match workspace packages resolved
      // through symlinks (velo -> repo root), so externalize velo by request
      // specifier instead. Keeping velo native guarantees ONE copy of the
      // Midnight runtime graph, shared with the natively loaded contract
      // bindings; a bundled second copy breaks WASM class checks
      // ("expected instance of ChargedState"). velo is ESM — fine on
      // Node >= 20.19 (require(esm)).
      config.externals.push(({ request }) => {
        if (request === "velo" || request.startsWith("velo/")) {
          return Promise.resolve(`commonjs ${request}`);
        }
        return Promise.resolve();
      });
    }
    return config;
  },
};

export default nextConfig;
