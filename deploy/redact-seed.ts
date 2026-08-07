/**
 * Seed-redaction helper, shared by every script in deploy/ that builds a
 * wallet.
 *
 * Red team F16 (docs/RED_TEAM_ROUND_4.md): `buildWalletAndWaitForFunds` in
 * @effectstream/midnight-contracts logs the raw wallet seed to stdout
 * unconditionally (`log.info(\`Wallet seed: ${seed}\`)`), with no flag to
 * suppress it. It is not VELO's code to patch, so every entry point that
 * reaches that function wraps the call and redacts the line.
 *
 * This lives in its own module rather than being copy-pasted into each
 * script: red team F8 was two copies of one function that had already
 * drifted apart before anyone noticed, and a redaction that silently stops
 * matching in one of two copies is exactly that failure with a worse
 * outcome.
 */

const SEED_LEAK_PATTERN = /(wallet\s*seed:?\s*)(\S+)/gi;

export function redactSeed(chunk: unknown): unknown {
  if (typeof chunk !== "string") return chunk;
  return chunk.replace(SEED_LEAK_PATTERN, "$1[REDACTED by VELO F16 mitigation — see docs/RED_TEAM_ROUND_4.md]");
}

/**
 * Run `fn` with stdout/stderr filtered through `redactSeed`, restoring the
 * original writers afterwards even if `fn` throws.
 */
export async function withSeedRedaction<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStdoutWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStderrWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);
  try {
    return await fn();
  } finally {
    process.stdout.write = originalStdoutWrite;
    process.stderr.write = originalStderrWrite;
  }
}

/** The network config minus the one field that must never be logged. */
export function safeNetworkConfigForLogging<T extends { walletSeed?: unknown }>(
  config: T,
): Omit<T, "walletSeed"> & { walletSeed: string } {
  const { walletSeed: _redacted, ...rest } = config;
  return { ...rest, walletSeed: "[REDACTED]" };
}
