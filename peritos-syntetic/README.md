# Synthetic examiner profiles for VELO (Layer 6 and Layer 7)

Corpus of 100% synthetic judicial/forensic examiner identities, designed
to feed the design of **Layer 6** (the examiner's ZK credential, Merkle
tree membership without revealing which one you are) and **Layer 7**
(blind second opinion — two examiners attest to the same
`case_commitment` independently).


## Why the schema has these fields (real grounding)

Researched on 2026-08-06 to avoid inventing an arbitrary structure:

- **Argentina** — judicial examiners register by jurisdiction (Federal
  Judiciary, or by province — Córdoba, Buenos Aires, etc.), require a
  **current professional license** certified by the relevant board/council,
  a minimum licensing tenure (Buenos Aires requires 5 years), a
  **recognized and validated specialty** (e.g. digital forensics as a
  specialty within an engineering/computer-science board), and proof of
  **continuing education**. Registration is renewed periodically, it is
  not perpetual. [Sources: cpci.org.ar, justiciacordoba.gob.ar,
  scba.gov.ar, servicios.pjn.gov.ar]
- **United States** — certifications like GCFE (GIAC), CFCE (IACIS), EnCE
  (OpenText/Guidance), CCE do not by themselves guarantee surviving a
  Daubert challenge. What actually sustains admissibility is
  **traceability of process**: detailed case notes, exact tool versions
  used, hash verification, tool-validation documentation. Certification is
  necessary but not sufficient. [Sources: giac.org,
  digitalforensicstoday.com, infosecinstitute.com]

**Design conclusion:** the Layer 6 ZK credential can't just prove "I
belong to the tree of accredited examiners" — it has to prove **validity
at the moment of attestation** (a `valid_from`/`valid_until` window,
analogous to Argentina's periodic renewal), because an expired license is
exactly the kind of vector a planted expert opinion would exploit. That's
why the schema below separates "belongs to the tree" from "currently
valid" as two distinct checks — the same pattern VIGÍA uses to separate
integrity from admissibility.

## Profile schema

```json
{
  "perito_id": "VELO-PERITO-XXX",
  "public_alias": "public identifier post-attestation, NOT the real name — the only thing visible on-chain if Layer 6 doesn't reach full anonymity",
  "jurisdiction_model": "AR | US | agnostic",
  "specialty": "...",
  "accrediting_body_synthetic": "FICTIONAL name of the board/council/certifier — never a real organization",
  "credential_id_synthetic": "format inspired by a real license/cert but with invented data",
  "matriculation_year": 20XX,
  "years_active": N,
  "valid_from": "ISO date",
  "valid_until": "ISO date",
  "continuing_education_hours_last_cycle": N,
  "cases_attested": ["VELO-XXX", ...],
  "credential_status_at_attestation": { "VELO-XXX": "VALID | EXPIRED | REVOKED" },
  "notes": "why this profile exists / what Layer 6-7 proof it exercises"
}
```

## Included profiles

| Examiner | Model | Specialty | Cases attested | Exercises |
|---|---|---|---|---|
| `VELO-PERITO-001` | AR | Digital forensics | VELO-001, VELO-002, VELO-011 | Happy path, current license; VELO-011 doubles as the "own case" side of the own-vs-others visibility fixture |
| `VELO-PERITO-002` | US | Digital forensics (cert-based) | VELO-003, VELO-004 | Happy path, US model |
| `VELO-PERITO-003` | AR | Digital forensics | VELO-005 (1st opinion) | Layer 7: first independent attestation |
| `VELO-PERITO-004` | US | Digital forensics | VELO-005 (2nd opinion) | Layer 7: second blind attestation, same `case_commitment` |
| `VELO-PERITO-005` | agnostic | Digital forensics | VELO-009, VELO-010 (valid); VELO-006 (expired) | Layer 6: validity gap between two licensing periods — the validity check must fail on VELO-006 even though the examiner belongs to the tree, and pass on VELO-009/010 |
| `VELO-PERITO-006` | AR | Digital forensics | VELO-012 | Own-vs-others visibility fixture: the "other examiner's case" counterpart to VELO-PERITO-001's VELO-011 |

`VELO-PERITO-005` uses `credential_periods: [...]` (an array of spans)
instead of a single `valid_from`/`valid_until` — it has a license that
expired without a timely renewal and a later re-licensing, with a real
gap between the two. The other 5 profiles use the simple field because
they don't need to model a gap. Verified that each case's artifact
timestamps (`cases/*.json`) fall inside (or, in case 005, deliberately
outside) the declared window — not assumed from memory.

`VELO-PERITO-005` is the key adversarial case: it belongs to the Merkle
tree of accredited examiners (the membership proof would pass), but at
the moment of attesting `VELO-006` its validity window had already
expired — the circuit must reject on validity, not on membership. It's
the Layer 6 equivalent of `VELO-004-cadena-rota` in `cases/` (ABSTAIN for
a broken chain of custody, not for the verdict).

## Own-vs-others visibility rule for the frontend

The perito-facing dashboard ("my cases") is the surface where Layer 6/7
ZK proofs actually gate what gets rendered. The rule this corpus is built
to exercise:

- **Own case** (`case_id` ∈ `perito.cases_attested`, with
  `credential_status_at_attestation[case_id] == "VALID"`): the examiner
  sees the full case object — `artifacts`, `devil_advocate`,
  `peirce_chain`, `demo_quote`, everything.
- **Someone else's case** (`case_id` ∉ `perito.cases_attested`): the
  examiner sees only `{case_id, name, expected_verdict,
  expected_corroboration_count}`. `artifacts`, `devil_advocate`, and
  `peirce_chain` stay hidden, and so does the attesting examiner's
  `public_alias` — the ZK proof only needs to show that *some* accredited,
  currently-valid examiner attested it, not who.
- **Unclaimed case** (`case_id` in no examiner's `cases_attested` at
  all): must not appear in *any* examiner's "my cases" list. It only
  belongs in a public/pending queue, and even there without
  `expected_verdict` exposed — nobody has attested it yet, so there is no
  verdict to show.

`VELO-PERITO-001` (owns VELO-011) and `VELO-PERITO-006` (owns VELO-012)
are a matched pair for testing the first two rules against each other's
data. `VELO-013-anonymous-drop.json` in `cases/` is attested by nobody on
purpose, to test the third.
