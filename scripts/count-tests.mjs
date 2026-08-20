#!/usr/bin/env node
/**
 * Measure both test suites with their own runners, then check that every
 * documented test count matches what was measured.
 *
 * Why this exists: on 2026-08-20 the docs claimed 58 engine + 44 frontend in
 * `TECHNICAL_STATUS.md` and 58 + 47 in `README.md`, while the runners were
 * reporting 115 and 116. Three different numbers, none of them current. For a
 * project whose whole claim is that its assertions are verifiable, a stale
 * self-measurement is the worst possible defect — `TECHNICAL_STATUS.md` §2.6
 * says as much about the platform, and the same standard has to apply to the
 * document making the claim.
 *
 * The fix is not to correct the numbers once. It is to make the numbers
 * measurable on demand and to fail loudly when a document disagrees with the
 * measurement.
 *
 * Usage:
 *   node scripts/count-tests.mjs            measure, then check every claim
 *   node scripts/count-tests.mjs --fix      same, but rewrite stale numbers
 *   node scripts/count-tests.mjs --json     measure only, print JSON
 *   node scripts/count-tests.mjs --counts 115,116   skip the runners (fast
 *                                           iteration; NOT for CI, since the
 *                                           point of this script is measuring)
 *
 * Exit code 1 means a document disagrees with the runners, or a claim site
 * this script is supposed to police has gone missing.
 */

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/* ------------------------------------------------------------------ */
/* 1. Measure                                                          */
/* ------------------------------------------------------------------ */

/**
 * Strip SGR colour escapes.
 *
 * This is not cosmetic. Vitest colourises its summary when it detects CI, so
 * `Tests  116 passed` arrives as `Tests \x1b[22m \x1b[1m\x1b[32m116 passed` and
 * a pattern written against local (uncoloured) output does not match. That is
 * exactly how the first CI run of this script failed. NO_COLOR is set on the
 * child as well, but a runner is free to ignore it, so the parse side is
 * hardened rather than trusting the request.
 */
export function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
}

export const ROOT_PATTERN = /^# pass (\d+)$/m;
export const FRONTEND_PATTERN = /Tests\s+(\d+) passed/;

function run(cmd, args, cwd) {
  // NO_COLOR / FORCE_COLOR=0 ask the runner for plain output; stripAnsi below
  // handles the case where it declines.
  const env = { ...process.env, NO_COLOR: "1", FORCE_COLOR: "0" };
  try {
    return stripAnsi(execFileSync(cmd, args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
  } catch (err) {
    // A failing suite still prints its totals; a suite that could not start
    // does not. Distinguishing the two matters — see parse() below.
    return stripAnsi(`${err.stdout ?? ""}${err.stderr ?? ""}`);
  }
}

/**
 * Pull a count out of runner output, or throw. Never falls back to a guess:
 * an unparseable run means we do not know the number, and "we do not know"
 * must not be reported as a number.
 */
export function parse(output, pattern, runner) {
  const m = stripAnsi(output).match(pattern);
  if (!m) {
    throw new Error(
      `could not read a test count from the ${runner} runner.\n` +
        `Expected output matching ${pattern}. The suite may have failed to start.\n` +
        `--- last 40 lines ---\n${output.split("\n").slice(-40).join("\n")}`,
    );
  }
  return Number.parseInt(m[1], 10);
}

export function measure() {
  process.stderr.write("measuring root suite (npm test)...\n");
  const root = parse(run("npm", ["test"], REPO), ROOT_PATTERN, "root (node:test)");

  process.stderr.write("measuring frontend suite (vitest run)...\n");
  const frontend = parse(run("npx", ["vitest", "run"], resolve(REPO, "frontend")), FRONTEND_PATTERN, "frontend (vitest)");

  return { root, frontend, total: root + frontend };
}

/* ------------------------------------------------------------------ */
/* 2. The claim registry                                               */
/* ------------------------------------------------------------------ */

/**
 * Every place a document states a test count. Each pattern must capture the
 * number in group 1.
 *
 * A pattern that stops matching is a FAILURE, not a pass. If someone rewords
 * a sentence, this script must say "I can no longer police this claim"
 * rather than silently stop checking it — the honest-degradation rule the
 * repo applies to its own loaders applies to its own tooling too.
 *
 * CHANGELOG.md is deliberately absent. A changelog is a dated log of what
 * changed, not an assertion about the present; its "58 engine + 47 frontend"
 * line correctly records what that commit did at the time.
 */
export const CLAIMS = [
  // --- README.md -----------------------------------------------------
  { file: "README.md", key: "root", re: /npm test          # (\d+) engine tests/ },
  { file: "README.md", key: "frontend", re: /npx vitest run   # (\d+) more/ },
  { file: "README.md", key: "total", re: /# \d+ more — (\d+) across both suites/ },
  { file: "README.md", key: "root", re: /\| Deterministic engine \+ Daubert gate \| \*\*Working\*\*, (\d+) tests \|/ },
  { file: "README.md", key: "total", re: /\| \*\*(\d+) green\*\* — \d+ engine/ },
  { file: "README.md", key: "root", re: /\*\*\d+ green\*\* — (\d+) engine \(`npm test`\)/ },
  { file: "README.md", key: "frontend", re: /engine \(`npm test`\) \+ (\d+) frontend/ },

  // --- README.es.md --------------------------------------------------
  { file: "README.es.md", key: "root", re: /npm test          # (\d+) tests del motor/ },
  { file: "README.es.md", key: "frontend", re: /npx vitest run   # (\d+) más/ },
  { file: "README.es.md", key: "total", re: /# \d+ más — (\d+) entre las dos suites/ },
  { file: "README.es.md", key: "root", re: /\| Motor determinista \+ gate de Daubert \| \*\*Funciona\*\*, (\d+) tests \|/ },
  { file: "README.es.md", key: "total", re: /\| \*\*(\d+) en verde\*\* — \d+ del motor/ },
  { file: "README.es.md", key: "root", re: /\*\*\d+ en verde\*\* — (\d+) del motor \(`npm test`\)/ },
  { file: "README.es.md", key: "frontend", re: /del motor \(`npm test`\) \+ (\d+) del frontend/ },

  // --- docs/TECHNICAL_STATUS.md --------------------------------------
  // The progression line ends at the current count, so it is a claim too.
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /→ 58\/58 → (\d+)\/\d+\*\*/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /→ 58\/58 → \d+\/(\d+)\*\*/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /own count gate to (\d+)\)/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "total", re: /the runners report \*\*(\d+)\npassing tests/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /passing tests: (\d+) in the engine/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "frontend", re: /in the engine \(`npm test`\) and (\d+) in the frontend/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /\| Root suite \| (\d+)\/\d+ green \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /\| Root suite \| \d+\/(\d+) green \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "frontend", re: /\| Frontend suite \| (\d+)\/\d+ green \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "frontend", re: /\| Frontend suite \| \d+\/(\d+) green \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "total", re: /\| \*\*Both suites\*\* \| \*\*(\d+)\/\d+ green\*\* \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "total", re: /\| \*\*Both suites\*\* \| \*\*\d+\/(\d+) green\*\* \|/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "root", re: /The runners report \*\*(\d+)\*\* and\s+\*\*\d+\*\*/ },
  { file: "docs/TECHNICAL_STATUS.md", key: "frontend", re: /The runners report \*\*\d+\*\* and\s+\*\*(\d+)\*\*/ },

  // --- docs/ESTADO_TECNICO.md ----------------------------------------
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /→ 58\/58 → (\d+)\/\d+\*\*/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /→ 58\/58 → \d+\/(\d+)\*\*/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /gate de conteo de este documento a (\d+)\)/ },
  { file: "docs/ESTADO_TECNICO.md", key: "total", re: /los runners informan \*\*(\d+)\ntests pasando/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /tests pasando: (\d+) en el motor/ },
  { file: "docs/ESTADO_TECNICO.md", key: "frontend", re: /en el motor \(`npm test`\) y (\d+) en el frontend/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /\| Suite raíz \| (\d+)\/\d+ en verde \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /\| Suite raíz \| \d+\/(\d+) en verde \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "frontend", re: /\| Suite de frontend \| (\d+)\/\d+ en verde \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "frontend", re: /\| Suite de frontend \| \d+\/(\d+) en verde \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "total", re: /\| \*\*Las dos suites\*\* \| \*\*(\d+)\/\d+ en verde\*\* \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "total", re: /\| \*\*Las dos suites\*\* \| \*\*\d+\/(\d+) en verde\*\* \|/ },
  { file: "docs/ESTADO_TECNICO.md", key: "root", re: /runners informan \*\*(\d+)\*\* y \*\*\d+\*\*/ },
  { file: "docs/ESTADO_TECNICO.md", key: "frontend", re: /runners informan \*\*\d+\*\* y \*\*(\d+)\*\*/ },

  // --- docs/QUICKSTART.md --------------------------------------------
  { file: "docs/QUICKSTART.md", key: "frontend", re: /Expected: `Tests  (\d+) passed \(\d+\)`/ },
  { file: "docs/QUICKSTART.md", key: "frontend", re: /Expected: `Tests  \d+ passed \((\d+)\)`/ },
  { file: "docs/QUICKSTART.md", key: "total", re: /\*\*(\d+) across both\*\*/ },
  { file: "docs/QUICKSTART.md", key: "root", re: /quote: (\d+) engine \+ \d+ frontend/ },
  { file: "docs/QUICKSTART.md", key: "frontend", re: /quote: \d+ engine \+ (\d+) frontend/ },
  { file: "docs/QUICKSTART.md", key: "root", re: /npm test                      # -> # pass (\d+) \/ # fail 0/ },
  { file: "docs/QUICKSTART.md", key: "frontend", re: /Esperado: `Tests  (\d+) passed \(\d+\)`/ },
  { file: "docs/QUICKSTART.md", key: "frontend", re: /Esperado: `Tests  \d+ passed \((\d+)\)`/ },
  { file: "docs/QUICKSTART.md", key: "total", re: /\*\*(\d+) entre las dos\*\*/ },
  { file: "docs/QUICKSTART.md", key: "root", re: /citar: (\d+) del motor \+ \d+ del frontend/ },
  { file: "docs/QUICKSTART.md", key: "frontend", re: /citar: \d+ del motor \+ (\d+) del frontend/ },

  // --- docs/velotechnicalstatus.html (both language halves) ----------
  { file: "docs/velotechnicalstatus.html", key: "root", re: /los runners informan (\d+) en el motor/ },
  { file: "docs/velotechnicalstatus.html", key: "frontend", re: /(\d+) en el frontend, (?:y )?\d+ en total/ },
  { file: "docs/velotechnicalstatus.html", key: "total", re: /\d+ en el frontend, (?:y )?(\d+) en total/ },
  { file: "docs/velotechnicalstatus.html", key: "root", re: /the runners report (\d+) in the engine/ },
  { file: "docs/velotechnicalstatus.html", key: "frontend", re: /(\d+) in the frontend, (?:and )?\d+ in total/ },
  { file: "docs/velotechnicalstatus.html", key: "total", re: /\d+ in the frontend, (?:and )?(\d+) in total/ },
];

/* ------------------------------------------------------------------ */
/* 3. Check                                                            */
/* ------------------------------------------------------------------ */

function lineOf(text, index) {
  return text.slice(0, index).split("\n").length;
}

export function check(counts, { fix }) {
  const cache = new Map();
  const read = (f) => {
    if (!cache.has(f)) cache.set(f, readFileSync(resolve(REPO, f), "utf8"));
    return cache.get(f);
  };

  const problems = [];
  const fixed = [];
  const dirty = new Set();
  let checked = 0;

  for (const claim of CLAIMS) {
    const text = read(claim.file);
    const expected = counts[claim.key];
    // The `d` flag gives exact capture-group offsets. Locating the number by
    // searching the match text instead is wrong whenever the same digits
    // appear twice in one match: `| Root suite | 115/115 green |` has two
    // claims over it, and a search-based fixer rewrote the denominator for
    // both, leaving `115/123`. Offsets are not ambiguous.
    const re = claim.re.flags.includes("d") ? claim.re : new RegExp(claim.re.source, `${claim.re.flags}d`);
    const m = re.exec(text);

    if (!m) {
      problems.push(
        `${claim.file}: claim site no longer matches ${claim.re}\n` +
          `    The sentence was reworded or removed. This script can no longer\n` +
          `    police that number — update the pattern in scripts/count-tests.mjs.`,
      );
      continue;
    }

    checked += 1;
    const found = Number.parseInt(m[1], 10);
    if (found === expected) continue;

    const line = lineOf(text, m.index);
    if (fix) {
      // Replace exactly the captured digits, by offset. Nothing else moves.
      const [start, end] = m.indices[1];
      cache.set(claim.file, text.slice(0, start) + String(expected) + text.slice(end));
      dirty.add(claim.file);
      fixed.push(`${claim.file}:${line}  ${claim.key} ${found} -> ${expected}`);
    } else {
      problems.push(`${claim.file}:${line}  claims ${claim.key} = ${found}, runners measured ${expected}`);
    }
  }

  // Only the files that actually changed — rewriting an untouched file would
  // churn its mtime and make `--fix` look like it did more than it did.
  for (const f of dirty) writeFileSync(resolve(REPO, f), cache.get(f), "utf8");

  return { problems, fixed, checked };
}

/* ------------------------------------------------------------------ */
/* 4. Main                                                             */
/* ------------------------------------------------------------------ */

// Only when run directly. Importing this module (tests/count-tests.test.ts
// exercises the parsers against captured runner output) must not spawn the
// suites, which would recurse.
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) main();

function main() {
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);

let counts;
const preset = argv.indexOf("--counts");
if (preset !== -1) {
  const [root, frontend] = (argv[preset + 1] ?? "").split(",").map((n) => Number.parseInt(n, 10));
  if (!Number.isInteger(root) || !Number.isInteger(frontend)) {
    console.error("--counts needs two integers, e.g. --counts 115,116");
    process.exit(2);
  }
  counts = { root, frontend, total: root + frontend };
  process.stderr.write("WARNING: --counts skips the runners; nothing here was measured.\n");
} else {
  try {
    counts = measure();
  } catch (err) {
    console.error(`FAILED TO MEASURE: ${err.message}`);
    process.exit(2);
  }
}

if (has("--json")) {
  console.log(JSON.stringify(counts, null, 2));
  process.exit(0);
}

const { problems, fixed, checked } = check(counts, { fix: has("--fix") });

console.log(`\nmeasured: root ${counts.root} · frontend ${counts.frontend} · total ${counts.total}`);
console.log(`claim sites checked: ${checked}/${CLAIMS.length}`);

if (fixed.length) {
  console.log(`\nrewritten (${fixed.length}):`);
  for (const f of fixed) console.log(`  ${f}`);
}

if (problems.length) {
  console.log(`\nPROBLEMS (${problems.length}):`);
  for (const p of problems) console.log(`  ${p}`);
  console.log(
    "\nThe documents disagree with the runners. Fix the docs (or run with --fix),\n" +
      "do not adjust the measurement.",
  );
  process.exit(1);
}

console.log("\nOK — every documented test count matches the runners.");
}
