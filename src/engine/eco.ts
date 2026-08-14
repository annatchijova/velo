/**
 * Eco overinterpretation filter — ported verbatim from VIGIA
 * `vigia/core/eco_check.py` (Apache-2.0, read in full before porting).
 *
 * Umberto Eco's razor: a perfect conspiracy leaves no obvious traces; if
 * there are too many, someone planted them (malice by distraction). The
 * decision is the integer predicate `2 * hits > n` — no float ever enters
 * the sealed path. `obviousRatio` is informational only (VIGIA R3 split:
 * the float is a report field, never a term in a score).
 *
 * Two uses, mirroring VIGIA D1:
 *   (a) per-text gate: exculpatory text that itself screams attack
 *       vocabulary is a signal, not a refutation (scorer gate D1);
 *   (b) set-level fracture: if more than half the artifacts carry obvious
 *       bait, the scene was probably staged (POSSIBLE_SCENE_STAGING).
 */

/**
 * Obvious-bait vocabulary — term present means the "evidence" screams
 * attack. Ported verbatim from VIGIA's `OBVIOUS_BAIT_TERMS`; single source
 * of truth, changes here are doctrine changes of the Eco filter. The
 * `virustotal` / `VirusTotal` duplication is preserved deliberately: hit
 * lists are parity-tested against the Python original, which carries both.
 */
export const OBVIOUS_BAIT_TERMS: readonly string[] = Object.freeze([
  "hack", "virus", "password", "contraseña", "attack",
  "log_deleted", "malware", "backdoor", "exploit",
  "admin123", "root", "pwned", "compromised", "hacked",
  // Threat-intel terms and known attack tooling
  "mimikatz", "ransomware", "vssadmin", "onion", "virustotal",
  "c2", "cobalt", "metasploit", "meterpreter", "empire",
  "lsass", "credential", "dump", "exfil", "lateral",
  "threatintel", "threat intel", "known_ransomware", "known malicious",
  "public threat", "VirusTotal", "virus total",
  // Network IOCs and geographic attribution
  "port scan", "portscan", "russian isp", "russian range",
  "known russian", "isp range", "known bad", "known malware",
  "blacklisted", "blocked ip", "tor exit",
  "command and control", "c&c", "botnet",
]);

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Word search with boundary handling, ported exactly from VIGIA's
 * `word_search` (including its inherited Gemini fix): `\b` fails on terms
 * containing non-word characters (`c&c`, `[ERROR]`), so those use
 * whitespace/line boundaries instead. Case-insensitive.
 *
 * Python's `\w` is Unicode-aware while JS `\w` is ASCII, so the
 * has-special test uses the Unicode classes explicitly. Every term in the
 * vocabulary starts and ends with an ASCII word character (the one
 * non-ASCII term, `contraseña`, has ASCII edges), so the ASCII `\b` at the
 * pattern edges behaves identically to Python's — parity-tested.
 */
export function wordSearch(term: string, text: string): boolean {
  const stripped = term.trim();
  if (stripped.length === 0) return false;
  const hasSpecial = /[^\p{L}\p{N}_]/u.test(stripped);
  const escaped = escapeRegExp(stripped);
  const pattern = hasSpecial
    ? `(?:^|(?<=\\s))${escaped}(?=\\s|$)`
    : `\\b${escaped}\\b`;
  return new RegExp(pattern, "iu").test(text);
}

/**
 * Obvious-bait terms present in a text, in vocabulary order (parity with
 * VIGIA's `text_obvious_bait_hits`). Empty list = the text does not scream
 * attack. This is the per-text primitive behind scorer gate D1.
 */
export function obviousBaitHits(text: string): string[] {
  const lowered = text.toLowerCase();
  return OBVIOUS_BAIT_TERMS.filter((t) => wordSearch(t, lowered));
}

export interface EcoResult {
  /**
   * The sealable decision: more than half the texts carry obvious bait.
   * Integer predicate `2 * hits > n`, exactly as in the Python original.
   */
  staged: boolean;
  /** Which texts tripped the filter and on which terms — audit detail. */
  hits: { text: string; terms: string[] }[];
  /**
   * Informational ONLY (VIGIA R3): a display ratio rounded to 2 decimals.
   * It is a float and must never be read by the scorer or enter a sealed
   * value — `canonicalize` would throw on it, and that throw is correct.
   */
  obviousRatio: number;
}

/**
 * Set-level Eco check, ported from VIGIA's `eco_overinterpretation_check`:
 * if more than half of the evidence texts contain obvious bait terms, the
 * scene was probably planted (POSSIBLE_SCENE_STAGING). Deterministic, no
 * float in the decision: `2 * hits > n`.
 */
export function ecoOverinterpretation(texts: string[]): EcoResult {
  const hits: { text: string; terms: string[] }[] = [];
  for (const text of texts) {
    const terms = obviousBaitHits(text);
    if (terms.length > 0) hits.push({ text, terms });
  }
  const n = texts.length;
  const staged = n > 0 && 2 * hits.length > n;
  const obviousRatio = n > 0 ? Math.round((hits.length / n) * 100) / 100 : 0;
  return { staged, hits, obviousRatio };
}
