#!/usr/bin/env bash
# Compile contracts/velo.compact and report clearly what passed and what did not.
#
# Run this on a machine with AVX2. The ZK backend (zkir) uses AVX2
# instructions and dies with SIGILL (exit code 132, or -4) on CPUs
# without it — that failure is hardware, not a bug in the contract.
#
#   bash scripts/compile-contract.sh
set -uo pipefail

cd "$(dirname "$0")/.."

echo "=============================================================="
echo "VELO — Compact contract compilation"
echo "=============================================================="
echo

echo "[1/4] CPU check"
if grep -qw avx2 /proc/cpuinfo 2>/dev/null; then
  echo "      AVX2: present — zkir should run"
else
  echo "      AVX2: MISSING — zkir will crash with SIGILL (exit 132)."
  echo "      Type-checking will still tell you if the contract is valid."
fi
echo

echo "[2/4] Toolchain"
if ! command -v compact >/dev/null 2>&1; then
  echo "      compact: NOT FOUND. Install it first:"
  echo "      curl --proto '=https' --tlsv1.2 -LsSf https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh"
  exit 127
fi
echo "      compact: $(compact --version 2>&1 | head -1)"
compact update 2>&1 | tail -2 || true
echo

echo "[3/4] Compiling contracts/velo.compact"
echo "--------------------------------------------------------------"
mkdir -p contracts/managed
set +e
compact compile contracts/velo.compact contracts/managed/velo 2>&1 | tee /tmp/velo-compile.log
COMPILE_EXIT=${PIPESTATUS[0]}
set -e
echo "--------------------------------------------------------------"
echo "      exit code: $COMPILE_EXIT"
echo

echo "[4/4] Verdict"
if [ "$COMPILE_EXIT" -eq 0 ]; then
  echo "      FULL COMPILE SUCCEEDED."
  echo
  echo "      Generated artifacts:"
  find contracts/managed/velo -type f 2>/dev/null | sed 's/^/        /' | head -20
  echo
  echo "      Next: the generated TypeScript bindings expose persistentHash,"
  echo "      which src/witness/witnesses.ts needs to compute the commitment"
  echo "      off-circuit. Wire that up and attest_case can stop being a stub."
elif [ "$COMPILE_EXIT" -eq 132 ] || [ "$COMPILE_EXIT" -eq 4 ]; then
  echo "      SIGILL — this CPU lacks AVX2. Hardware limit, not a contract bug."
  if grep -qi "compiling.*circuit" /tmp/velo-compile.log; then
    echo "      GOOD NEWS: it reached circuit compilation, so the parser and"
    echo "      TYPE-CHECKER ACCEPTED THE CONTRACT. Syntax and types are valid."
    echo "      Only the ZK backend could not run here."
  fi
else
  echo "      COMPILATION FAILED — likely a real problem in the contract."
  echo
  echo "      The four things flagged as unverified in contracts/velo.compact,"
  echo "      in the order they are most likely to be the cause:"
  echo
  echo "      (3) 'verdict as Field as Bytes<32>' — casting an ENUM through"
  echo "          Field. Documented for Counter, not for enums. If this is the"
  echo "          error, the fix is to hash a struct instead of a Vector:"
  echo "            struct AttestationCore { fingerprint: Bytes<32>, ... }"
  echo "            persistentHash<AttestationCore>(AttestationCore { ... })"
  echo "      (2) 'Vector<6, Bytes<32>>' — arity or hashing of a 6-element vector."
  echo "      (1) persistentHash vs persistentCommit for the commitment."
  echo "      (4) disclose() on already-public circuit arguments."
  echo
  echo "      Full log: /tmp/velo-compile.log"
fi
echo
echo "=============================================================="
