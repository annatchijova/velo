/**
 * Single point of contact with `process.env`. Everything else in the
 * codebase reads configuration through this function rather than
 * `process.env` directly, so environment access stays greppable and
 * (if ever needed) mockable in one place.
 */
export function getEnv(name: string): string | undefined {
  const value = process.env[name];
  return value && value.trim().length > 0 ? value.trim() : undefined;
}
