# Implementation Plan: Accessibility Impact Prioritisation

## Overview

Extend Pa11y Dashboard v5.2.1 with four additive capabilities: deterministic priority
computation, priority display with optional per-tab sort, inline remediation guidance, and a
scan comparison view. The implementation adds a `lib/` directory for pure logic, new data files,
new routes, new Handlebars partials, a new view, and new CSS — all without removing or altering
existing behaviour and without introducing new npm dependencies.

All new files must carry a GPL-3.0 licence header matching the format used in existing source
files. `data/overrides.json` must be added to `.gitignore` and must never be committed.

---

## Tasks

- [x] 1. Create static data files
  - [x] 1.1 Create `data/heuristic-impact.js`
    - Export `getHeuristicImpact()` returning a frozen object mapping WCAG technique IDs to
      `{ category, rank }` as specified in the design lookup table
    - Categories: `Screen-Reader Blocking` (rank 1), `Keyboard Navigation` (rank 2),
      `Colour Contrast` (rank 3), `General` (rank 4), `Informational` (rank 5)
    - Include all entries listed in the design; default fallback is `{ category: 'General', rank: 4 }`
    - GPL-3.0 licence header; use `module.exports = function getHeuristicImpact() { ... }`
    - _Requirements: 1.4, 1.10, 10.1, 10.3_

  - [x] 1.2 Create `data/remediation-guidance.js`
    - Export `getRemediationGuidance()` returning a plain object mapping technique IDs to
      `{ steps: string, example: string }`
    - Include at minimum the three example entries from the design (`H37`, `H44`, `G18`) and
      document the pattern so more entries can be added trivially
    - GPL-3.0 licence header; follow `data/techniques.js` pattern with `module.exports = function`
    - _Requirements: 5.1, 5.6, 10.1, 10.3_

  - [x] 1.3 Add `data/overrides.json` entry to `.gitignore`
    - Append `data/overrides.json` to `.gitignore` so it is never committed
    - _Requirements: 10.1_

- [x] 2. Implement the override I/O module
  - [x] 2.1 Create `lib/overrides.js`
    - Implement `readAll()`: reads `data/overrides.json`; returns `{}` on ENOENT; throws on all
      other errors
    - Implement `get(taskId, ruleCode)`: returns the matching entry or `null`
    - Implement `set(taskId, ruleCode, level, reason)`: validates that `level` is one of
      `Critical | High | Medium | Low` and that `reason` is non-empty; performs an atomic
      write (write to `.tmp`, then rename) to ensure the live file is never partially-written
    - Implement `remove(taskId, ruleCode)`: removes the entry; no-op if absent; atomic write
    - Override entry key format: `"taskId:ruleCode"`
    - GPL-3.0 licence header; use only `node:fs` and `node:path`
    - _Requirements: 2.1, 2.6, 10.1, 10.3_

  - [x] 2.2 Write unit tests for `lib/overrides.js`
    - Test `readAll()` with missing file (returns `{}`), valid file, and non-ENOENT error (throws)
    - Test `set()` validation: empty reason rejected, invalid level rejected, valid call writes
      correct JSON entry
    - Test `get()` returns matching entry and returns `null` for missing key
    - Test `remove()` deletes entry and is a no-op when entry absent
    - Test atomic write: final file reflects the update, no `.tmp` file left behind
    - GPL-3.0 licence header; Mocha + proclaim; place at `test/unit/lib/overrides.js`
    - _Requirements: 9.1, 9.5, 9.6_

- [x] 3. Implement the Prioritisation Engine
  - [x] 3.1 Create `lib/prioritise.js`
    - Implement `prioritise(groupedRules, overridesMap)` returning an annotated copy of the
      input array (no mutation)
    - Implement `deriveImpact(ruleCode, table)` using the lookup strategy:
      `segments.slice(4).join('.')` → split on `,` → `token.split('.')[0]` → exact match →
      leading-letters prefix match → fallback `{ category: 'General', rank: 4 }`
    - Implement `computeLevel(type, count)`:
      `error` → `High`; `warning` with count ≥ 5 → `High`; `warning` with count < 5 → `Medium`;
      `notice` → `Low`
    - Attach `priorityLevel` (override or computed), `computedLevel`, `impactCategory`,
      `impactCategoryRank`, `confidence` (`high-confidence` when both first item's `selector`
      and `context` are non-null and non-empty, else `low-confidence`), `isOverride`, `overrideReason`
    - `Critical` is never produced by `computeLevel`; it can only come from an override
    - Handle null/empty `selector` and `context` without throwing
    - Require `data/heuristic-impact.js`
    - GPL-3.0 licence header; `module.exports = { prioritise }`
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8, 1.9, 1.10, 2.2, 10.1, 10.3_

  - [x] 3.2 Write unit tests for `lib/prioritise.js`
    - **Property P1: Totality** — output length equals input length; no entry is null/undefined
      — _Validates: Requirements 1.1_
    - **Property P2: Type mapping** — `error` → `High`; `notice` → `Low`;
      `warning` with count ≥ 5 → `High`; `warning` with count < 5 → `Medium`
      — _Validates: Requirements 1.3_
    - **Property P3: No automatic Critical** — without overrides, no output has `priorityLevel === 'Critical'`
      — _Validates: Requirements 1.3_
    - **Property P4: Override supremacy** — when override exists, `priorityLevel` equals override
      level and `isOverride` is `true`
      — _Validates: Requirements 2.2, 2.3_
    - **Property P5: Confidence correctness** — both non-empty first-item selector and context
      → `high-confidence`; otherwise `low-confidence`
      — _Validates: Requirements 1.9_
    - **Property P6: Impact Category Rank range** — `impactCategoryRank` is always in `{1,2,3,4,5}`
      — _Validates: Requirements 1.10_
    - **Property P7: Sort order** — output is deterministic for the same input
      — _Validates: Requirements 1.5_
    - Also cover: count boundary conditions (count = 4, count = 5, count = 6); null selector and
      context; unrecognised rule code falls back to `General` rank 4; within-level tie-break
      ordering (Impact Category Rank ASC, count DESC)
    - GPL-3.0 licence header; Mocha + proclaim; place at `test/unit/lib/prioritise.js`
    - _Requirements: 9.2, 9.5, 9.6_

- [x] 4. Implement the Comparison Engine
  - [x] 4.1 Create `lib/compare.js`
    - Implement `compare(earlier, later)` returning `{ likelyResolved, persistent, newFindings }`
    - Four-step matching precedence:
      1. Exact match: both selectors non-empty, equal after `normalise` (trim + lowercase)
      2. Context-Fallback: both selectors non-empty but unequal; match on code + normalised
         context; only when exactly one match in each pool (else mark `_ambiguous`)
      3. Missing-selector context: selector null/empty on either side; match on code + normalised
         context with same uniqueness guard
      4. Code-only: both selector and context null/empty on finding; match by code alone;
         `matchLabel = 'code-only'`, `isPrecise = false`
    - Unmatched early findings: `matchLabel = 'ambiguous'` if `_ambiguous`, else `'unmatched'`;
      note text differs accordingly
    - `classified(ef, lf, matchLabel, matchNote)` helper assembles the `ClassifiedFinding` shape
    - Handle null/empty `selector` and `context` without throwing
    - GPL-3.0 licence header; no external dependencies; `module.exports = { compare }`
    - _Requirements: 7.4, 7.5, 7.11, 7.12, 10.1, 10.3_

  - [x] 4.2 Write unit tests for `lib/compare.js`
    - **Property P8: Total coverage** — every early finding appears in exactly one of
      `likelyResolved` or `persistent`; every late finding in exactly one of
      `persistent` or `newFindings`
      — _Validates: Requirements 7.3_
    - **Property P9: One-to-one matching** — no finding is matched more than once
      — _Validates: Requirements 7.4_
    - **Property P10: Step-2 selector guard** — `context-fallback` match only when both
      selectors are non-empty
      — _Validates: Requirements 7.4_
    - **Property P11: Ambiguous match exclusion** — findings marked `_ambiguous` never appear
      in `persistent`
      — _Validates: Requirements 7.12_
    - **Property P12: Step-3 missing-selector guard** — `code-and-context` match only when at
      least one selector is null/empty and both contexts are non-empty and equal
      — _Validates: Requirements 7.4_
    - Also cover: step 1 exact match; step 3 fires when early selector present but late missing;
      step 3 fires when early selector missing; step 3 does NOT fire when both selectors present;
      code-only imprecise match; `isPrecise === false` only for `code-only`; ambiguous match
      labelled correctly; `'Likely Resolved — possible selector change'` sub-label via `matchNote`
    - GPL-3.0 licence header; Mocha + proclaim; place at `test/unit/lib/compare.js`
    - _Requirements: 9.3, 9.5, 9.6_

- [x] 5. Checkpoint — pure logic layer complete
  - Ensure all unit tests in `test/unit/` pass before continuing
  - Run: `node_modules/.bin/mocha 'test/unit/**/*.js' --recursive`
  - Ask the user if any test fails or if design clarification is needed before proceeding

- [x] 6. Add Handlebars helpers
  - [x] 6.1 Add `lower-case` helper to `view/helper/string.js`
    - Register `hbs.registerHelper('lower-case', context => context.toLowerCase())`
    - The helper is used by `{{lower-case rule.priorityLevel}}` to generate CSS class names in
      `priority-badge.html`
    - Note: the file already has a `lowercase` helper; add `lower-case` (hyphenated) as a
      separate registration alongside it — do not rename the existing one
    - _Requirements: 3.2, 10.6_

  - [x] 6.2 Add `if-equal` helper to `view/helper/conditionals.js`
    - Register `hbs.registerHelper('if-equal', function(a, b, options) { return a === b ? options.fn(this) : options.inverse(this); })`
    - Used by `{{#if (if-equal rule.type "notice")}}` and `{{#if (if-equal rule.type "warning")}}`
      in `priority-badge.html`
    - _Requirements: 3.6, 3.7, 10.6_

- [x] 7. Create new Handlebars partials
  - [x] 7.1 Create `view/partial/priority-badge.html`
    - Render priority badge `<span>` with class `priority-badge priority-badge--{{lower-case rule.priorityLevel}}`
      and `aria-label`
    - If `rule.isOverride`: render override indicator glyphicon and `rule.overrideReason` text
    - Always render impact category label with "(estimated impact)" suffix
    - Always render confidence label (`rule.confidence`)
    - If `rule.type === 'notice'`: render disclaimer "Informational — not a confirmed failure"
    - If `rule.type === 'warning'`: render disclaimer "May require manual verification — not a confirmed failure"
    - GPL comment block at top (Handlebars comment `{{! ... }}`)
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9_

  - [x] 7.2 Create `view/partial/remediation.html`
    - If `rule.remediation` is present: render `<h4>How to fix:</h4>`, `<p>` with steps text,
      `<h5>Example:</h5>`, and `<pre><code>{{{rule.remediation.exampleEscaped}}}</code></pre>`
    - If absent: render fallback `<h4>How to fix:</h4>` with generic message; include WCAG
      technique link from `rule.solutions` if available, or plain text if not
    - GPL comment block at top
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 6.1, 6.3_

  - [x] 7.3 Create `view/partial/priority-override-form.html`
    - Wrap entire content in `{{#unless readonly}}...{{/unless}}`
    - If `rule.isOverride`: show current level and reason; render remove form
      `POST /:id/override/remove` with hidden `rule` input and accessible remove button
    - If not override: render `<details><summary>Set priority override…</summary>` containing
      a form `POST /:id/override` with hidden `rule` input, level `<select>` with four options,
      reason `<input type="text">` (required), and submit button
    - Show inline validation error if `overrideError` is set and `overrideErrorRule` matches
      `rule.code`; use `role="alert"` and `aria-live="assertive"` on the error element
    - All inputs have `<label for="...">` with unique IDs using `{{rule.code}}`
    - GPL comment block at top
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 10.7_

  - [x] 7.4 Create `view/partial/task-compare-control.html`
    - Wrap in `{{#if hasMultipleResults}}`
    - Render a `<form action="/{{task.id}}/compare" method="get">` with two `<select>` elements
      (`earlierId`, `laterId`), each populated via `{{#each allResults}}` with `value="{{id}}"` and
      display text as formatted date
    - Each `<select>` has an explicit `<label for="...">` with matching `id`
    - `required` on both selects
    - Include a short disclaimer paragraph about inferred results
    - GPL comment block at top
    - _Requirements: 7.1, 7.2, 7.9, 8.4_

  - [x] 7.5 Create `view/partial/compare-finding-row.html`
    - Render a `.panel.panel-default.compare-finding` with `aria-label` containing rule code
      and priority level
    - Panel heading: rule code span, `{{> priority-badge rule=finding}}`, match label badge and
      match note text (shown only when `finding.matchNote` is present)
    - Panel body: `finding.message` paragraph; selector `<code>` block shown only when non-empty
    - GPL comment block at top
    - _Requirements: 7.5, 7.7, 8.2, 8.3_

- [x] 8. Create the comparison page view
  - [x] 8.1 Create `view/compare.html`
    - `{{#content "title"}}` block: "Pa11y Dashboard — Scan Comparison — {{task.name}}"
    - Include `{{> result-header}}`
    - Render prominent `role="note"` disclaimer alert about inferred results
    - Three `<section aria-labelledby="...">` landmarks:
      "Likely Resolved (not verified)" (badge with `totalResolved`),
      "Persistent" (badge with `totalPersistent`),
      "New" (badge with `totalNew`)
    - Each section iterates with `{{#each ...}}{{> compare-finding-row finding=this}}{{/each}}`
    - Include a back link/button to return to the task page (`/{{task.id}}`)
    - GPL comment block at top
    - _Requirements: 7.3, 7.8, 8.1, 8.2, 8.3_

- [x] 9. Create CSS for priority badges
  - [x] 9.1 Create `public/css/priority.css`
    - Define `.priority-badge` base styles (padding, border-radius, font-weight, inline-block)
    - Define four colour classes with WCAG AA verified contrast (≥ 4.5:1 against `#ffffff`):
      `.priority-badge--critical { background-color: #c0392b; color: #ffffff; }` (5.44:1)
      `.priority-badge--high     { background-color: #c2410c; color: #ffffff; }` (5.18:1)
      `.priority-badge--medium   { background-color: #15803d; color: #ffffff; }` (5.02:1)
      `.priority-badge--low      { background-color: #1d4ed8; color: #ffffff; }` (6.70:1)
    - GPL comment block at top (CSS block comment)
    - _Requirements: 3.2, 3.3_

- [x] 10. Extend `view/presenter/result.js`
  - [x] 10.1 Add prioritisation and remediation calls to `view/presenter/result.js`
    - After the existing sort step (inside the `if (result.results)` block), call
      `prioritise(result.errors, overridesMap)`, `prioritise(result.warnings, overridesMap)`,
      `prioritise(result.notices, overridesMap)` and reassign each array
    - Build `overridesMap` using `lib/overrides.js` `readAll()` filtered to the current task ID
      and keyed by `ruleCode`
    - Call `lookupRemediation(rule.code, remediationTable)` on every rule in all three arrays
      and attach `rule.remediation`; if `rule.remediation.example` is present, attach
      `rule.remediation.exampleEscaped` using the HTML escape sequence from the design
    - Implement `htmlEscape(str)` as a private function in the same file
    - All existing logic and exports remain unchanged
    - _Requirements: 1.1, 1.2, 5.2, 5.3, 10.2, 10.6_

- [x] 11. Create `view/presenter/compare.js`
  - [x] 11.1 Create `view/presenter/compare.js`
    - Export `presentCompare(comparison, task, overridesMap)`
    - Implement `annotateFindingArray(findings, overridesMap)`: groups findings by code into
      pseudo `groupedRules`, calls `prioritise()`, spreads annotated fields back onto each
      individual finding while preserving `selector`, `context`, `matchLabel`, `matchNote`,
      `isPrecise`
    - Annotate all three arrays: `likelyResolved`, `persistent`, `newFindings`
    - Return template data including `task`, `likelyResolved`, `persistent`, `newFindings`,
      `totalResolved`, `totalPersistent`, `totalNew`, `earlierDate`, `laterDate`
    - GPL-3.0 licence header
    - _Requirements: 7.7, 10.1, 10.2, 10.3_

- [x] 12. Create new route handlers
  - [x] 12.1 Create `route/task/compare.js`
    - Register `GET /:id/compare` handler (mirrors `route/task/edit.js` pattern)
    - Query params: `earlierId`, `laterId` — return 404 if either is missing
    - Fetch task (`webservice.task(id).get()`), fetch both results with `{ full: true }`
      (three async calls); return 404 if any fetch fails
    - Call `compare(earlierResult.results, laterResult.results)`
    - Build `overridesMap` from `lib/overrides.js`
    - Call `presentCompare(comparison, task, overridesMap)` and render `compare` view
    - Format `earlierDate` and `laterDate` as strings before passing to the presenter
    - GPL-3.0 licence header; `module.exports = function compare(app) { ... }`
    - _Requirements: 7.2, 7.3, 7.10, 10.1_

  - [x] 12.2 Create `route/task/override.js`
    - Register `POST /:id/override` handler: parse body fields `rule`, `level`, `reason`;
      validate level is one of `Critical | High | Medium | Low` and reason is non-empty;
      on failure redirect to `/:id?override-error=1&rule=<ruleCode>`;
      on success call `lib/overrides.js` `set()` then redirect to `/:id?rule-overridden=1`
    - Register `POST /:id/override/remove` handler: call `lib/overrides.js` `remove()`;
      redirect to `/:id?override-removed=1`
    - Suppress both handlers (or short-circuit) when `app.express.locals.readonly === true`
    - GPL-3.0 licence header; `module.exports = function override(app) { ... }`
    - _Requirements: 2.1, 2.5, 2.6, 2.7, 10.1_

- [x] 13. Update existing files with additive changes
  - [x] 13.1 Register new routes and link CSS in `app.js` and `view/layout/default.html`
    - In `app.js` `loadRoutes()`: add `require('./route/task/compare')(app)` and
      `require('./route/task/override')(app)` **before** the existing
      `require('./route/task/index')(app)` line; place the compare and override requires
      also inside the `if (!config.readonly)` block per design instruction for override;
      compare route should be outside the readonly block (read-only operation)
    - In `view/layout/default.html`: add
      `<link rel="stylesheet" href="/css/priority.css?v={{version}}"/>` after the existing
      `site.min.css` link tag
    - _Requirements: 7.10, 10.2_

  - [x] 13.2 Update `route/task/index.js` with additive response fields
    - Inside the existing render call, add:
      `allResults: results.map(r => ({ id: r.id, date: new Date(r.date) }))`,
      `hasMultipleResults: results.length >= 2`,
      `overrideError: request.query['override-error'] || null`,
      `overrideErrorRule: request.query['rule'] || null`
    - Do not remove or rename any existing fields passed to render
    - _Requirements: 7.1, 7.9, 2.5, 10.6_

  - [x] 13.3 Update `view/partial/result.html` with priority badge, override form, and remediation
    - For each rule card `.panel` in the errors, warnings, and notices tab panels, add:
      - `data-priority-order="{{priorityOrder}}"`, `data-impact-rank="{{impactCategoryRank}}"`,
        `data-count="{{count}}"` attributes on the `.panel` element
      - `{{> priority-badge rule=this}}` inside the `.panel-heading` row, after the rule-name span
      - `{{> priority-override-form rule=this}}` inside the `.panel-body`, before the existing
        solutions/selectors content
      - `{{> remediation rule=this}}` at the end of `.task-details` div, after selectors list
    - Do not remove or alter any existing markup
    - _Requirements: 3.1, 3.4, 3.5, 3.8, 3.9, 5.2, 6.1, 6.2, 6.3_

  - [x] 13.4 Update `view/task/index.html` with compare scans control
    - Inside the `{{#if results}}` block, after the `{{#unless hasOneResult}}{{> graph}}{{/unless}}`
      section, add `{{> task-compare-control}}`
    - Also add flash messages for `ruleOverridden` and `ruleOverrideRemoved` following the existing
      `ruleIgnored` / `ruleUnignored` alert pattern
    - Do not remove or alter any existing markup
    - _Requirements: 7.1, 7.9_

  - [x] 13.5 Add client-side sort control to `public/js/site.js`
    - Inside the existing `$(document).ready(function(){ ... })` block, append a new section
      after the existing code
    - For each tab panel (errors-list, warnings-list, notices-list), inject a "Sort by priority"
      button with `aria-pressed="false"` before the first rule card; add an `aria-live="polite"`
      note about tie-break ordering
    - On button click: toggle `aria-pressed`; if now `true`, sort `.panel` children by
      `data-priority-order ASC → data-impact-rank ASC → data-count DESC` using original DOM
      order stored in `data-orig-index`; if now `false`, restore original order
    - Sort state is per-tab and independent
    - Do not modify any existing variable declarations or function definitions
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_

- [x] 14. Checkpoint — full stack wired
  - Run the existing integration test suite to confirm no regressions:
    `node_modules/.bin/mocha 'test/integration/**/*.js' --recursive --timeout 20000`
  - Fix any failures before proceeding to write new integration tests
  - Ask the user if any issue arises

- [x] 15. Write integration tests for new routes
  - [x] 15.1 Create `test/integration/route/task/compare.js`
    - Test `GET /<task-id>/compare?earlierId=<id1>&laterId=<id2>` returns 200
    - Test response HTML contains the disclaimer text
    - Test response HTML contains the three section headings ("Likely Resolved", "Persistent", "New")
    - Test `GET /<task-id>/compare` (missing params) returns 404
    - Test `GET /nonexistent/compare?earlierId=x&laterId=y` returns 404
    - Follow the existing Mocha + proclaim + cheerio pattern from `test/integration/route/task/index.js`
    - GPL-3.0 licence header
    - _Requirements: 9.1, 9.4, 9.5, 9.6_

  - [x] 15.2 Create `test/integration/route/task/override.js`
    - Test `POST /<task-id>/override` with valid body creates override and redirects to `?rule-overridden=1`
    - Test `POST /<task-id>/override` with empty reason redirects to `?override-error=1`
    - Test `POST /<task-id>/override/remove` deletes override and redirects to `?override-removed=1`
    - Test that override controls are absent when readonly mode is enabled (re-init app with
      `readonly: true`)
    - GPL-3.0 licence header; Mocha + proclaim + cheerio
    - _Requirements: 9.1, 9.4, 9.5, 9.6_

- [x] 16. Write unit tests for `data/heuristic-impact.js`
  - [x] 16.1 Create `test/unit/data/heuristic-impact.js`
    - Verify `getHeuristicImpact()` returns the correct `{ category, rank }` for a sample of
      technique IDs spanning all five categories
    - Verify the result is frozen (attempting to mutate throws in strict mode)
    - Verify that an unknown key is not present in the table (confirm fallback handled by engine)
    - Verify `ARIA` → `Screen-Reader Blocking` rank 1; `G18` → `Colour Contrast` rank 3;
      `H91` → `Keyboard Navigation` rank 2; `H42` → `General` rank 4; `G5` → `Informational` rank 5
    - GPL-3.0 licence header; Mocha + proclaim; place at `test/unit/data/heuristic-impact.js`
    - _Requirements: 9.2, 9.5, 9.6_

- [x] 17. Final checkpoint — all tests pass
  - Run the full test suite including both integration and unit tests
  - `node_modules/.bin/mocha 'test/unit/**/*.js' 'test/integration/**/*.js' --recursive --timeout 20000`
  - Confirm all pre-existing integration tests still pass without modification
  - Ensure `data/overrides.json` is listed in `.gitignore` and absent from the working tree
  - Ask the user if any issue arises before marking the feature complete

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; all non-starred tasks
  must be implemented
- Checkpoints (tasks 5, 14, 17) are integration gates — do not proceed past them until all tests
  pass
- Property tests (P1–P12) validate universal correctness properties of the pure logic engines;
  unit tests for routes validate specific examples and edge cases
- Every new file needs a GPL-3.0 licence header matching the format in existing files
  (JS block comment `// This file is part of Pa11y Dashboard ...`; HTML Handlebars comment
  `{{! This file is part of ... }}`)
- `data/overrides.json` is a runtime artefact; it must not be committed and must be added to
  `.gitignore` in task 1.3 before any write path is implemented
- The `lower-case` Handlebars helper (hyphenated) is distinct from the existing `lowercase`
  helper already registered in `view/helper/string.js`; both must coexist
- The comparison route (`GET /:id/compare`) is a read-only operation and should be registered
  outside any `readonly` guard in `app.js`; the override route (`POST /:id/override`) should be
  inside the readonly guard
- `priorityOrder` used in `data-priority-order` is the integer rank of the level:
  Critical = 0, High = 1, Medium = 2, Low = 3; it should be computed inside `lib/prioritise.js`
  alongside the other fields

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "9.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "6.1", "6.2"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1"] },
    { "id": 3, "tasks": ["4.2", "10.1", "11.1", "7.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 4, "tasks": ["8.1", "12.1", "12.2", "16.1"] },
    { "id": 5, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5"] },
    { "id": 6, "tasks": ["15.1", "15.2"] }
  ]
}
```
