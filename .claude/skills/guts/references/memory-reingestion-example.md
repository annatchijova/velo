# Worked example: derived memory in an agent framework (anonymized)

Shows how to fill GUTS's per-link status when most of the chain is still unexamined. It is a starting position, not a finding. The framework is deliberately unnamed.

**Provenance of the facts below.** Everything under "Established" and "Reproduced" is inherited from the investigator's own earlier report on a different question (the cost of a regex-search tool). It was not re-verified for this pass. No behavior of the framework is asserted beyond what that report states.

## Scenario

An agent processes external content (document, email, web page, tool result), writes derived notes into its own persistent memory through a write tool, and later retrieves them through a search tool whose results return to the model.

**Question:** does retrieved content keep its provenance (provenance loss), and where a label exists, does the consumer apply the matching restrictions (enforcement failure)?

**Threat model (as stated in the earlier report).** The attacker can influence content that reaches the agent's context (indirect injection). The attacker cannot modify framework code or configuration and cannot call tools directly; tools are reached only through the model's own calls.

## Chain under investigation

| # | Link | Status | Evidence and limits |
|---|---|---|---|
| 1 | source → transformation: the model writes a note derived from hostile content | Unverified causal | The report asserts the model does this in ordinary operation. It was never run: no live model was used. |
| 2 | transformation → by-product: the note persists in the memory store | Structural (inherited) | The memory provider is enabled by default in the factory; the write tool is registered with approval mode "never_require" as a literal. Read from code by the investigator. |
| 3 | by-product → consumer: stored text is returned to the model by the search tool | Structural (inherited) for the route; unexamined for labels | The search tool exists and returns matches. Whether results carry any origin label is not examined. |
| 4 | consumer → trust boundary: re-entered content is tagged untrusted, and some policy depends on the tag | Unexamined | Both mechanisms open: no label (provenance loss) or label without policy (enforcement failure). |
| 5 | trust boundary → observable effect: a tool call motivated by derived content | Unexamined | No prediction fixed yet. |

Chain status: **capped at PLAUSIBLE HYPOTHESIS.** Links 1 and 3 to 5 have not been run. Two components were executed individually in the earlier work; no end-to-end run of the factory with a model exists. No end-to-end exploitation is claimed, and none follows from the existing evidence.

## Reproduced behaviors (inherited, component level)

Direct calls to the search primitive showed that its documented 10-second timeout did not bound execution for a catastrophic pattern: the timeout error fired at roughly 17 s on one input, an event-loop polling script printed no checkpoints within 35 s on a larger one, and two unrelated asyncio tasks each advanced one tick instead of about ten while one such search ran. These concern the cost of a single tool. They are not a link of the chain above, and GUTS does not use them to raise the severity of the original issue.

## Negative results (inherited, scoped)

- The transcript-search tool matches by plain substring and never compiles a regex, so the regex-cost issue does not apply to it. Scope: that issue only. Nothing here says anything about the provenance of transcript content.
- Two attempts to find an innocuous-looking pattern that is also catastrophic failed for the two shapes tried. Scope: those two shapes.

## Pending hypotheses

Each states a prediction and a cheapest discriminating test. None has been run. All are conditional on code that has not yet been read.

- **H1a, absence of provenance on re-ingestion.** If the provider injects stored memory into the model context at all, it does so without origin marking. First step: read the provider's context assembly (structural). Then: place a semantic canary in a hostile document and check whether it reaches a fresh session's context unmarked. The canary must survive summarization; an exact string may not. This is one alternative, not an assumption.
- **H1b, preserved provenance with unenforced restrictions.** The provider carries an origin label into the model context, but no approval or authorization decision depends on the restrictions that label implies. Prediction: changing only the label does not change any tool-approval decision. This is the alternative to H1a, not a conclusion from the same observation.
- **H3, survival across sessions.** If the default store location is shared across sessions or users, a note written in one is read in another under the same trust. Prediction: a canary written in session A is retrieved in session B.
- **H4, residue.** Error text or telemetry produced by the search tool include attacker-influenced pattern or matched content. Prediction: a canary appears in an error message or trace.
- **H5, transcripts.** What the transcript store keeps, and under what label, is unexamined even though the regex issue was ruled out for it.

Not a GUTS hypothesis: how the write tool handles model-chosen file names and paths (traversal, collisions). That is input handling at entry, so it belongs to `validate-at-the-boundary`.

## Limitations of the evidence

- No live model, no live MCP server, no end-to-end run of the factory. All inherited confirmations are component level.
- Tested on one interpreter family and one pinned framework version, as in the original report; neither is restated here.
- The framework's context-assembly code has not been read for this pass.

## Result of this pass

**ABSTAIN**, not NO FINDING: five hypotheses are unexamined, so no probe has had the chance to see anything. Recording NO FINDING here would claim coverage that does not exist.
