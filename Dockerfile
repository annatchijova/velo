# Cloud Run image for the VELO frontend (Next.js) + its read-only chain API.
#
# Build context is the REPO ROOT: the frontend depends on the root package's
# compiled output (velo/* via "velo": "file:.."), and /api/chain reads the
# deployed contract's real ledger using the committed compiled bindings under
# contracts/managed/ plus the deployed address in deploy/managed-shim/. All of
# those must be present in the runtime image.
#
#   gcloud run deploy velo --source . --region us-central1
#
# Reads only: this container never needs a wallet, proving keys for writing, or
# a local proof server. Attestation WRITES stay on the expert's machine by
# design (see docs/ARCHITECTURE.md). The hosted app does seal, verify, and
# on-chain reads — all of which only need outbound HTTPS to the public
# preview indexer, which Cloud Run allows by default.

FROM node:22-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY frontend/package.json ./frontend/package.json
RUN npm ci

FROM node:22-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/frontend/node_modules ./frontend/node_modules
COPY . .
# Root build first: the frontend externalizes `velo` (see next.config.mjs) and
# imports its compiled JS from dist/, not the .ts sources.
RUN npm run build
RUN cd frontend && npm run build

FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Cloud Run injects PORT; Next.js honors it via `next start -p $PORT`.
ENV PORT=8080
# Default network for the chain reads; overridable at deploy time.
ENV MIDNIGHT_NETWORK_ID=preview
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/cases ./cases
COPY --from=build /app/peritos-syntetic ./peritos-syntetic
# /api/chain needs these at request time: repoRoot() walks up to find
# contracts/velo.compact, dynamically imports contracts/managed/velo/contract/
# index.js, and reads the deployed address from deploy/managed-shim/.
COPY --from=build /app/contracts ./contracts
COPY --from=build /app/deploy/managed-shim ./deploy/managed-shim
COPY --from=build /app/frontend ./frontend
WORKDIR /app/frontend
EXPOSE 8080
CMD ["sh", "-c", "npx next start -p ${PORT}"]
