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
 * Run `fn` with console output and raw stream writes filtered through
 * `redactSeed`, restoring everything afterwards even if `fn` throws.
 *
 * BOTH layers are patched, and that is not belt-and-braces — it is the
 * difference between working and not working depending on the runtime:
 *
 *  - Patching only `process.stdout.write` works under Node, where
 *    `console.log`/`console.info` funnel through it. **It does not work
 *    under Bun**, which implements `console` natively and writes straight
 *    to the file descriptor without passing through the JS-level
 *    `process.stdout.write`. The first version of this mitigation patched
 *    only the stream, was verified only under Node, and then failed to
 *    redact anything on the first real Bun run — the seed printed in full.
 *    See docs/RED_TEAM_ROUND_4.md F16 and docs/LEARNINGS.md L2.
 *  - Patching only `console.*` would miss anything writing to the stream
 *    directly.
 *
 * The dependency does `const log = console; log.info(...)`, holding a
 * reference to the console *object*, so replacing methods on that same
 * object is seen by it.
 */
type ConsoleMethod = "log" | "info" | "warn" | "error" | "debug" | "trace";
const CONSOLE_METHODS: ConsoleMethod[] = ["log", "info", "warn", "error", "debug", "trace"];

export async function withSeedRedaction<T>(fn: () => Promise<T>): Promise<T> {
  const originalStdoutWrite = process.stdout.write.bind(process.stdout);
  const originalStderrWrite = process.stderr.write.bind(process.stderr);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const originalConsole: Partial<Record<ConsoleMethod, any>> = {};

  for (const method of CONSOLE_METHODS) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const original = (console as any)[method];
    if (typeof original !== "function") continue;
    originalConsole[method] = original;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (console as any)[method] = (...args: unknown[]) => original.apply(console, args.map(redactSeed));
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stdout as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStdoutWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (process.stderr as any).write = (chunk: unknown, ...args: unknown[]) =>
    (originalStderrWrite as (...a: unknown[]) => boolean)(redactSeed(chunk), ...args);

  try {
    return await fn();
  } finally {
    for (const [method, original] of Object.entries(originalConsole)) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (console as any)[method] = original;
    }
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
