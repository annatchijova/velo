# Frontend Test-Driven Development (TDD)

> **Scope:** This document applies **only** to the `frontend/` codebase. It does not authorize, require, or permit changes to backend test coverage, backend API tests, or any non-frontend test suite.

## Mandatory TDD workflow

For every new frontend feature, component, module, page, hook, or utility, follow this strict order:

1. **Write failing tests first.** Before any implementation code exists, write targeted tests that express the feature's formal acceptance criteria. These tests must fail when run against an empty or stub implementation.
2. **Write minimal implementation.** Add only the frontend code required to make the pre-written tests pass.
3. **Refactor.** Improve code quality, performance, and maintainability while keeping all frontend tests green.
4. **Validate the full suite.** Run the complete frontend test suite (`npm run test:all`) after every TDD cycle to confirm no regressions.

No frontend implementation may be committed without its corresponding failing test having been written first and subsequently passing.

## Test types

Choose the smallest appropriate set of test types for the work.

| Work item | Required test types | Notes |
|---|---|---|
| Pure function / utility | Unit | `src/lib/utils.ts`, formatters, parsers, validators |
| React hook | Unit / integration | Render with `renderHook`, exercise state transitions |
| Presentational component | Unit / integration | Props, rendering, user interactions, a11y |
| Component with context/provider | Integration | Wrap with providers (`I18nProvider`, `WalletProvider`, etc.) |
| Page / route | Integration / E2E | Mock data and API calls; use E2E for critical flows |
| Wallet connection flow | E2E | Requires `window.midnight` mocks or real extension |
| Critical user journey (seal → attest → verify) | E2E | Must run across viewports |

### Unit tests

- Framework: **Vitest**
- Location: `src/**/*.test.ts` or `src/**/*.test.tsx`
- Use for: pure functions, hooks, isolated components

### Integration tests

- Framework: **Vitest + React Testing Library**
- Location: `src/**/*.test.tsx`
- Use for: components with providers, user-event interactions, multi-step UI flows that do not require a real browser process

### End-to-end tests

- Framework: **Playwright**
- Location: `e2e/**/*.spec.ts`
- Use for: page-level flows, wallet connection seams, responsive behavior, accessibility smoke tests across devices

## Aligning tests with acceptance criteria

Each test file should map to one or more acceptance criteria from the feature's issue or design doc. Use a top-level comment or describe block:

```ts
/**
 * AC-1: The verdict badge renders the label for each verdict tier.
 * AC-2: The badge uses the correct color tokens for accessibility contrast.
 */
describe("VerdictBadge", () => {
  // tests
});
```

Checklist before opening a pull request:

- [ ] Acceptance criteria are listed in the test file or linked in the PR description.
- [ ] Every acceptance criterion has at least one automated test.
- [ ] Tests fail before implementation and pass after implementation.
- [ ] Edge cases (empty input, invalid verdict, missing data) are covered.
- [ ] User interactions are exercised with `@testing-library/user-event` or Playwright.

## Accessibility checklist

Every new component, page, or flow must have tests covering:

- [ ] **Keyboard navigation:** Focus order and visible focus indicators (`:focus-visible`).
- [ ] **Screen reader labels:** Buttons and icons have accessible names (`aria-label`, `aria-labelledby`, or visible text).
- [ ] **Color contrast:** Critical text/background combinations meet WCAG 2.1 AA (4.5:1 for normal text).
- [ ] **Reduced motion:** Animations respect `prefers-reduced-motion` where applicable.
- [ ] **Semantic landmarks:** Pages include `<main>`, `<nav>`, and skip links where appropriate.
- [ ] **Form errors:** Inputs announce errors via `aria-describedby` or `aria-live` regions.

Use React Testing Library queries that reflect accessible semantics:

```ts
screen.getByRole("button", { name: /seal case/i });
screen.getByLabelText(/search cases/i);
```

## Responsive behavior checklist

Tests must verify behavior across all supported viewports.

Supported viewports:

| Name | Width | Typical device |
|---|---|---|
| Mobile | 375 px | iPhone SE / small phone |
| Tablet | 768 px | iPad / tablet portrait |
| Desktop | 1440 px | Desktop |

For unit/integration tests, use CSS media query mocks or render at different container widths when relevant. For E2E tests, use Playwright projects or `page.setViewportSize()` to exercise each breakpoint.

Checklist:

- [ ] Content remains readable without horizontal scrolling at 375 px.
- [ ] Touch targets are at least 44 × 44 CSS pixels on mobile.
- [ ] Navigation collapses or adapts on small screens.
- [ ] Tables and grids provide accessible overflow or card layouts on narrow viewports.
- [ ] Font sizes scale correctly using `clamp()` or Tailwind responsive prefixes.

## Running tests

```bash
# Unit + integration tests (CI mode)
npm run test

# Watch mode during development
npm run test:watch

# End-to-end tests
npm run test:e2e

# E2E tests with UI debugger
npm run test:e2e:ui

# Full frontend validation (unit + integration + e2e)
npm run test:all
```

Run the full suite after every complete TDD cycle and before pushing.

## Test file conventions

- Co-locate tests with source files: `Component.tsx` + `Component.test.tsx`.
- E2E tests live in `e2e/` and mirror page or flow names.
- Name tests with a clear subject + expected outcome:
  ```ts
  it("renders the MALICE label and rose dot", () => { ... });
  ```
- Avoid testing implementation details; test behavior and user-observable outcomes.

## Keeping this document current

Update this document when:

- A new frontend testing tool is added or removed.
- Supported viewports change.
- Accessibility requirements change.
- The TDD workflow is revised.

The frontend README must link to this document. Any frontend onboarding or contribution guide must reference this workflow as mandatory.
