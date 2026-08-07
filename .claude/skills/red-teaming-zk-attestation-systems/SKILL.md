---
name: Red-Teaming-ZK-Attestation-Systems
description: Use when auditing a system that seals, hashes, or ZK-proves a verdict, credential, or reputation claim — forensic/DFIR engines, evidence pipelines, attestation contracts, ledger commitments, or any deploy tooling that handles a wallet seed. Symptoms this applies: "does the proof establish X", "what exactly is committed/hashed", "the ZK circuit proves...", a commitment/hash whose exact inputs haven't been read, or a deploy script that needs a real wallet.
---

# Red-Teaming ZK / Deterministic Attestation Systems

## Overview

A specialization of `red-team-auditing` (**REQUIRED BACKGROUND** — this skill assumes its epistemic ladder: CODE FACT / PLAUSIBLE HYPOTHESIS / CONFIRMED BY INDUCTION / FALSIFIED, and its threat-model discipline). Produced across four real audit rounds on VELO (a ZK forensic-attestation system on Midnight): 18+ confirmed findings, most fixed and reverified by induction, one deliberately falsified attempt kept in the record. This packages what was *specific* to that domain, not the general method.

**Origin note, stated plainly:** written by distilling four completed rounds, not pressure-tested against baseline agent failures the way `writing-skills` prescribes for discipline-enforcing skills — that process was skipped here under real time constraints. Treat this as a strong checklist, not a bulletproofed one; the underlying findings it's built from are real and independently verified (`docs/RED_TEAM_ROUND_1.md` through `_4.md` in this repo).

## The recurring failure class: promise vs. what's actually bound

The single most productive question across all four rounds, asked of every hash/commitment/proof in the system:

> **What exactly are the bytes going into this, and does that match what the prose claims it proves?**

Every serious finding in this project's history was a version of this:
- A commitment excluded a field the docs said it covered (custody tip missing → truncation invisible).
- A commitment excluded a field that made its central claim *vacuous* (verdict/count not bound → any verdict could be attached to any commitment).
- A count was described as "independent sources," cryptographically enforced — it was an analyst-declared string comparison, enforced nowhere.
- "Nothing here ever leaves" was true of raw evidence and false of the diagram's own downstream arrows (commitment, verdict, timestamp all leave, by design).

**Method:** read the exact hash/circuit inputs from the live source — never from the doc describing them, never from memory of an earlier version. State the vector/struct fields explicitly and diff them against every claim made about what's proven.

## Quick reference — attack surface checklist for this system class

| Layer | Ask |
|---|---|
| Commitment / hash inputs | Read the *exact* fields hashed, in the live circuit/code. Does it bind the verdict, or just supporting evidence around it? |
| "Independent sources" / corroboration counts | Is independence *proven* (cryptographically, structurally) or *declared* (a string the caller wrote)? |
| Witness/private-input provenance | Does anything bind a witness to a real execution, or can a prover hand-pick values satisfying the circuit's arithmetic with no real computation behind them? |
| Re-attestation / replay | Can the same (or a trivially modified) input be submitted twice? Does a counter/ledger entry change when it shouldn't? |
| New HTTP/agent-facing surface | `Content-Type` checked before parsing as JSON? (CORS-safelisted types bypass preflight — CSRF via a plain `<form>`.) |
| Agent-driven write calls (MCP, tool-calling) | Does free-text evidence content reach an LLM deciding call parameters? Test with an actual injected instruction in a fresh, unbiased subagent — not a hypothetical. |
| Deploy / wallet tooling | Grep for `log`/`console` calls near anything named `seed`, `mnemonic`, `key`. Check every hardcoded fallback default — a "dev placeholder" password committed to a public repo protects nothing once it's public. Read the *exact pinned* third-party dependency version (download the real tarball; don't trust the package description). |
| Doc references | Does every "see README/X" comment point at a section that actually exists? |

## Discipline notes specific to this project's failures

- **Re-verify the target file before writing the finding.** This codebase had multiple concurrent sessions; a target file moved or was retired mid-audit twice. Read live state, always — a finding against a file that was already refactored out from under you is a wasted report.
- **Falsification is not failure.** One induction attempt (prompt injection against an agent-driven seal call) was tried for real, with a fresh unbiased subagent, and failed to manipulate the agent — recorded as FALSIFIED with the caveat that one run, one model, one framing doesn't close the search, and the architectural gap it targeted (server does no validation of its own) survives regardless of the attempt's outcome.
- **A mitigation is not a fix.** When the root cause lives in a third-party dependency (an upstream log line leaking a secret), say so precisely: what was applied is a redaction wrapper around the call, not a patch of the actual defect. Don't let "MITIGATED" read as "FIXED."
- **Historical framing stays historical.** When updating a doc after the codebase changes, strike through what's now false and add a dated update — don't silently rewrite what was true when it was written.
