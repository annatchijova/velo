# VELO — Demo flight plan

This folder is the one place to open before and during the pitch. Everything
in it is a symlink into the real repo (`docs/`, `visual/`, `.claude/skills/`)
— nothing here is a separate copy, so it can never drift out of sync with the
actual submission. Edit the source file, not the link.

```
demo/
├── diagrams/    3 SVGs for the deck  → visual/
├── pages/       4 illustrated standalone pages → docs/velo-*.html
├── decks/       the 3 .pptx decks → docs/
├── skills/      the audit-methodology Claude Skill → .claude/skills/
└── reference/   every doc, for live Q&A lookup → docs/
```

Everything below was verified against the live repo right before being
written down — not recalled from memory. If a number here ever looks wrong,
trust the live command over this file.

---

## 1. The 60-second pitch, in three layers

Say layer 1 first, always. Only go to layer 2–3 if the room asks for more —
leading with jargon lost the room once already (see `demo/reference/BUSINESS.md`
framing).

**Layer 1 — the stakes, no jargon.**
> "Today a forensic expert has two options, and both are bad: publish the
> raw evidence so people believe the verdict, or publish nothing and ask to
> be trusted. We picked neither."

**Layer 2 — the mechanism, one sentence.**
> "The evidence never leaves the expert's machine. What crosses to Midnight
> is a commitment and a zero-knowledge proof: the verdict is bound to a
> sealed analysis, and — if it's MALICE — the corroboration rule was
> satisfied. Not a promise. A circuit constraint."

**Layer 3 — why it's credible, only if pushed.**
> "We ran four rounds of our own adversarial audit against this system —
> `demo/skills/red-teaming-zk-attestation-systems.md` is the methodology,
> packaged as a reusable Claude Skill. Twelve of thirteen findings in round
> one, fixed and re-verified. What's still open, we say so — out loud, in
> the docs, right now."

---

## 2. Live commands — run in this order, on stage

Every line below was actually run against the current `main` before writing
this file.

```bash
npm install && npm run build     # clean build, no errors
npm test                         # 58/58 green (includes the corpus test —
                                  # all 14 synthetic cases reproduce their
                                  # documented verdict)
npm run simulate                 # the flagship demo: full flow + BOTH
                                  # refusals (not enough sources → SUSPICION;
                                  # no custody → ABSTAIN on IDENTICAL evidence)
```

**The moment that sells it, inside `npm run simulate`:** the exact same
artifacts produce `MALICE` with a custody record and `ABSTAIN` without one.
Say this line out loud when it prints: *"Identical evidence, opposite
outcome. Admissibility is a property of the process, not of how
incriminating the evidence looks."*

**Contract compilation** (only if presenting from a machine with AVX2 — this
one doesn't have it, confirmed):

```bash
bash scripts/compile-contract.sh
```

Expect `FULL COMPILE SUCCEEDED` with prover/verifier keys generated. If run
on a non-AVX2 machine, it fails at the ZK backend with a clear message
distinguishing "hardware can't run this" from "the contract is wrong" — read
that message out loud if it happens live, don't panic and don't skip past it.

**The contract is live on Midnight preview** — deployed, not just compiled:

```
contract address: 46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d
network:          preview
recorded in:      deploy/managed-shim/velo-contract.preview.json
```

Say this plainly if asked "is any of this actually on-chain": yes, the
contract itself is deployed and reachable — what's *not* wired yet is the
app calling it (`attest_case` / `/api/attest` are still placeholders, see §5).
That's a precise, defensible claim, not an overclaim.

---

## 3. Screen sequence

1. `demo/pages/velo-architecture.html` — open first. Dual-ledger split is the
   single image that makes the whole pitch legible before any jargon.
2. `demo/diagrams/diagram-flow.svg` — the seal → attest → verify flow, if
   presenting from slides rather than the live HTML page.
3. Terminal: the live commands from §2.
4. `demo/diagrams/diagram-verdict-scale.svg` — NOISE/SUSPICION/MALICE +
   ABSTAIN set apart as a refusal, not a 4th severity step.
5. `demo/pages/velo-identity.html` — only if asked "how do you know who the
   expert is" — credential, not biometrics, tied to real audit findings.
6. `demo/pages/velo-business.html` — only if asked about business viability —
   flagged in the page itself as vision/roadmap, not hackathon code.
7. `demo/pages/velo-roadmap.html` — closing slide equivalent: what's built
   vs. what's next.

---

## 4. Objection crib sheet

Full answers in `demo/reference/FAQ.md`. One line each here, for recall
under pressure:

| Question | One-line answer | Full answer |
|---|---|---|
| What does the proof actually prove? | Binding of verdict↔fingerprint↔custody at attestation time — not that an engine really ran, not that the expert was honest. Both gaps named explicitly. | FAQ.md §1, `RED_TEAM_ROUND_2.md` G1 |
| Why Midnight, not Aztec/Aleo? | Dual-ledger + native `disclose()` is the exact primitive; Aleo is private-by-default (backwards fit), Aztec has no explicit public/private split. | FAQ.md §2 |
| Why forensics, not finance? | Same general problem (prove a rule without revealing the data), forensics is a domain with real depth and no competing team. | FAQ.md §3 |
| Why not just a database? | No single party — not even the expert — can retroactively alter a public ledger. A DB always has an admin. | FAQ.md §4 |
| What if the expert lies before sealing? | Not solved, and said so: post-hoc tampering is prevented, a corrupt original analysis is not — same as any forensic report today. | FAQ.md §5 |
| Why ZK, isn't a hash chain enough? | Hash chain proves *unaltered*. It can't publish a rule was satisfied without publishing the data that satisfies it. That's the specific gap ZK closes. | FAQ.md §6 |
| Isn't this forcing Midnight? | Technically portable to Ethereum+circom, but the public/private boundary would be hand-built with more surface for error. | FAQ.md §7 |
| Does a hash prove anything *legally*? | Yes — FRE 902(13)/(14) since 2017. ZK-as-authentication has no precedent yet, and we say that plainly. | FAQ.md §8 |
| Isn't this already done elsewhere? | Each piece exists separately; the specific combination (admissibility rule as a circuit constraint + anonymous expert credential, forensic domain) is the gap. | FAQ.md §9 |
| Why biometrics for the expert? | We don't, on purpose — biometrics identifies a person, credentials authorize a role. Full reasoning tied to 3 real audit findings. | `demo/reference/IDENTITY.md` |

---

## 5. What's honestly still open — say this before a judge finds it

Reading these out loud, unprompted, is stronger than waiting to be caught.

- **`attest_case` / `/api/attest` are still placeholders.** The contract is
  now genuinely deployed and live on Midnight preview
  (`46cac58c4eb0e034b4211d754bfe67f7e8e1aa08d448ebd089437ed573023d9d` — see
  §2), which is real progress, not a claim — but nothing in the app calls it
  yet. Check `src/mcp/server.ts` and `frontend/src/app/api/attest/route.ts`
  before claiming otherwise if this changes before the demo.

  **Deploy history, if asked "did it work first try" or "tell us about a
  hard bug"** (full account in `docs/LEARNINGS.md`, L1 and L3) — two
  distinct failures, not one:
  1. First attempts failed with "Insufficient Funds: could not balance
     dust" — turned out to be a missing NIGHT-for-DUST registration step,
     not actually insufficient funds.
  2. With that fixed, the next failure was `Custom error: 170` at
     submission. The tempting fix — a forum thread on this exact error
     pointed at a ledger version mismatch — was checked against Midnight's
     own compatibility matrix and correctly ruled out: every component
     already matched. The real cause was DUST sync state still settling
     (observed flapping `true → false → true` in the sync log) when the
     transaction was built, so the spend proof referenced a merkle root
     that was already being superseded. Waiting for sync to fully settle
     before submitting fixed it — no version bump needed.

  This is a genuinely good answer to "walk us through a hard bug": a
  plausible wrong fix was available and specifically *not* taken, because
  the evidence (the compatibility matrix, the sync-state log) didn't
  support it. That's the same abductive discipline the project's own red
  team methodology names in `demo/skills/red-teaming-zk-attestation-systems.md`.
- **Witness provenance (G1, `RED_TEAM_ROUND_2.md`).** The circuit proves a
  relationship between witnesses; it cannot prove those witnesses came from a
  real engine run on real evidence. Named explicitly in `ARCHITECTURE.md`,
  not hidden.
- **Source independence (G3).** `corroboration_count` is analyst-declared and
  distinct-by-provenance-root, not cryptographically verified as physically
  independent.
- **No revocation model yet (G8)** — meaningless before the credential itself
  exists, which it doesn't yet either.
- **Deploy secrets (F16/F17, `RED_TEAM_ROUND_4.md`).** A third-party
  dependency logs the deploying wallet seed in plaintext; mitigated with a
  redaction wrapper on VELO's side, but the upstream bug isn't VELO's to fix
  — say that distinction if asked.

---

## 6. If something breaks live

From the team's own hackathon plan (`docs/ROADMAP.md`'s spirit, carried
into demo day): **do not narrate a failure as a success.** If `npm run
simulate` or the compile script fails on stage:

1. Read the actual error out loud — VELO's whole premise is that a system
   which fails should say so honestly, not paper over it. This is in
   character, not off-message.
2. Fall back to §2's last known-good captured output (screenshot it once,
   beforehand, and keep it in this folder as `known-good-output.png` if you
   want a safety net — not included here on purpose, since a stale
   screenshot is worse than none if nobody remembers to refresh it).
3. Move to the architecture page (§3.1) and narrate the design instead of
   the live run. The design is real and defensible even in the seconds a
   command is failing.
