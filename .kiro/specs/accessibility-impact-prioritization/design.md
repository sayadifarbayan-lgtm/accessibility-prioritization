# Design Document — Accessibility Impact Prioritisation

## Overview

This design extends Pa11y Dashboard v5.2.1 with four additive capabilities: deterministic priority
computation, priority display with an optional sort, inline remediation guidance, and a scan
comparison view. The implementation slots entirely into the existing architecture:

- New pure-logic modules live in a `lib/` directory (no equivalent currently exists).
- New data files follow the `data/techniques.js` pattern.
- New routes are registered in `app.js` in the existing `require('./route/...')` style.
- New view partials and one new view are added to `view/partial/` and `view/`.
- `view/presenter/result.js` gains one additional call to the prioritisation engine; nothing
  existing is removed or altered.
- `public/js/site.js` gains an appended sort-control block; no existing code is modified.
- Priority overrides are persisted in a local JSON file managed entirely by the dashboard process,
  requiring no changes to the Pa11y Webservice or its MongoDB schema.

No npm dependency not already listed in `package.json` is introduced. Every new file carries a
GPL-3.0 licence header matching the format used in existing files.

---

## Architecture

The feature adds a new `lib/` directory for pure logic modules, following the principle that
presentation (view/presenter), routing (route/), and data files (data/) remain separate concerns.
The overall request flow is unchanged: Express routes call webservice client → presenter →
render. The prioritisation step is inserted as a synchronous sub-call inside the existing result
presenter. The comparison view follows the same route → presenter → render pattern as all
existing views.

```
┌──────────────┐    GET /:id         ┌─────────────────────────┐
│ Browser      │ ──────────────────► │ route/task/index.js     │
│              │                     │  webservice.task().get() │
│              │                     │  webservice.task().      │
│              │                     │    results()             │
│              │                     │  presentTask()           │
│              │                     │  presentResult() ──────► lib/prioritise.js
│              │                     │  presentResultList()     │
│              │                     │  render('task')          │
│              │ ◄────────────────── └─────────────────────────┘
│              │
│              │    GET /:id/compare  ┌─────────────────────────┐
│              │ ──────────────────► │ route/task/compare.js   │
│              │                     │  webservice (×3 fetches) │
│              │                     │  lib/compare.js          │
│              │                     │  presentCompare()        │
│              │                     │  render('compare')       │
│              │ ◄────────────────── └─────────────────────────┘
│              │
│              │    POST /:id/override ┌────────────────────────┐
│              │ ──────────────────► │ route/task/override.js  │
│              │                     │  validate body           │
│              │                     │  lib/overrides.js        │
│              │                     │  redirect /:id           │
│              │ ◄────────────────── └────────────────────────┘
└──────────────┘
```

**Integration points requiring minimal changes to existing files:**

1. `app.js` — two new `require('./route/task/...')` lines added before `route/task/index`.
2. `view/presenter/result.js` — one call to `prioritise()` and one call to `lookupRemediation()` appended after the existing grouping/sorting logic.
3. `view/partial/result.html` — additive insertions of two new partials and three data attributes; no existing markup removed.
4. `public/js/site.js` — sort-control block appended inside the existing `ready` function.
5. `view/layout/default.html` — one additional `<link>` tag for `priority.css`.

No other existing file is modified.

---

## Components and Interfaces

### `lib/prioritise.js`

**Inputs:** `groupedRules: object[]`, `overridesMap: object`
**Output:** annotated copy of `groupedRules` (new objects, not mutated)
**Dependencies:** `data/heuristic-impact.js`
**Interface:**

```js
module.exports = { prioritise };
// function prioritise(groupedRules, overridesMap): object[]
```

### `lib/compare.js`

**Inputs:** `earlier: object[]`, `later: object[]` (raw Pa11y findings)
**Output:** `{ likelyResolved, persistent, newFindings }` each an array of `ClassifiedFinding`
**Dependencies:** none
**Interface:**

```js
module.exports = { compare };
// function compare(earlier, later): ComparisonResult
```

### `lib/overrides.js`

**Inputs/outputs:** see §3 Data Layer — Override Storage
**Dependencies:** `node:fs`, `node:path`
**Interface:**

```js
module.exports = { readAll, get, set, remove };
```

### `view/presenter/compare.js`

**Inputs:** `(comparison, task, overridesMap)`
**Output:** shaped object for `compare.html` template
**Dependencies:** `lib/prioritise.js`, `moment`
**Interface:**

```js
module.exports = presentCompare;
// function presentCompare(comparison, task, overridesMap): object
// Internal: annotateFindingArray(findings, overridesMap): ClassifiedFinding[]
```

(The `earlier` and `later` full result objects are no longer passed to the presenter; the route passes the formatted dates directly.)

### `route/task/compare.js`

**Pattern:** `module.exports = function compare(app) { app.express.get('/:id/compare', ...) }`
Mirrors the pattern of `route/task/edit.js`.

### `route/task/override.js`

**Pattern:** `module.exports = function override(app) { app.express.post(...); app.express.post(...) }`
Mirrors the pattern of `route/task/ignore.js`.

### `data/heuristic-impact.js`

**Interface:** `module.exports = function getHeuristicImpact(): object`
Returns a frozen plain object. No side effects.

### `data/remediation-guidance.js`

**Interface:** `module.exports = function getRemediationGuidance(): object`
Returns a plain object. No side effects.

### Handlebars Helpers (additions to existing helpers)

Two new helpers added to existing helper registration files:

- `lower-case` in `view/helper/string.js` — lowercases a string; used for CSS class names.
- `if-equal` in `view/helper/conditionals.js` — block helper: renders block if two arguments are strictly equal.

---

## Data Models

### Pa11y Finding (existing, unchanged)

```js
{
  code:         string,
  type:         string,   // 'error' | 'warning' | 'notice'
  typeCode:     number,   // 1 | 2 | 3
  message:      string,
  context:      string?,
  selector:     string?,
  runner:       string,
  runnerExtras: object,
}
```

### Annotated Rule Group (output of `prioritise()`)

```js
{
  // existing fields
  code:               string,
  type:               string,
  count:              number,
  message:            string,
  items:              Array<{ selector: string?, context: string? }>,
  solutions:          Array<{ title: string, url: string }>,
  // new fields
  priorityLevel:      'Critical' | 'High' | 'Medium' | 'Low',
  priorityOrder:      0 | 1 | 2 | 3,
  computedLevel:      'High' | 'Medium' | 'Low',
  impactCategory:     string,
  impactCategoryRank: number,
  confidence:         'high-confidence' | 'low-confidence',
  isOverride:         boolean,
  overrideReason:     string | null,
  remediation:        { steps: string, example: string, exampleEscaped: string } | null,
}
```

### ClassifiedFinding (output of `compare()`)

```js
{
  code:        string,
  type:        string,
  message:     string,
  selector:    string?,
  context:     string?,
  matchLabel:  'exact' | 'context-fallback' | 'code-and-context'
               | 'code-only' | 'ambiguous' | 'unmatched',
  matchNote:   string | null,
  isPrecise:   boolean,
}
```

After passing through `presentCompare()`, each `ClassifiedFinding` also carries all fields from the `Annotated Rule Group` model above.

### Override Entry (in `data/overrides.json`)

```js
{
  taskId:    string,
  ruleCode:  string,
  level:     'Critical' | 'High' | 'Medium' | 'Low',
  reason:    string,
  updatedAt: string,
}
```

### Heuristic Impact Entry

```js
{
  [techniqueId: string]: {
    category: 'Screen-Reader Blocking' | 'Keyboard Navigation'
              | 'Colour Contrast' | 'General' | 'Informational',
    rank:     1 | 2 | 3 | 4 | 5,
  }
}
```

### Remediation Guidance Entry

```js
{
  [techniqueId: string]: {
    steps:   string,
    example: string,  // raw HTML/ARIA; pre-escaped into exampleEscaped in the presenter
  }
}
```

---

## New Files and Their Responsibilities

| Path | Responsibility |
|---|---|
| `lib/prioritise.js` | Pure Prioritisation Engine |
| `lib/compare.js` | Pure Comparison Engine |
| `lib/overrides.js` | Thin I/O module for the local JSON override store |
| `data/heuristic-impact.js` | Static lookup table: WCAG rule-code prefix → Heuristic Impact category + rank |
| `data/remediation-guidance.js` | Static lookup table: rule code → `{ steps, example }` |
| `data/overrides.json` | Runtime JSON file; created on first write |
| `route/task/compare.js` | `GET /:id/compare` |
| `route/task/override.js` | `POST /:id/override` and `POST /:id/override/remove` |
| `view/presenter/compare.js` | Shapes comparison engine output for the `compare` template |
| `view/partial/priority-badge.html` | Renders the priority badge, impact label, and confidence label |
| `view/partial/remediation.html` | Renders the remediation guidance subsection |
| `view/compare.html` | Full page view: three comparison sections, disclaimer, finding rows |
| `public/css/priority.css` | Priority badge colour styles; verified WCAG AA 4.5:1 |
| `test/unit/lib/prioritise.js` | Unit tests for the Prioritisation Engine |
| `test/unit/lib/compare.js` | Unit tests for the Comparison Engine |
| `test/unit/lib/overrides.js` | Unit tests for the override I/O module |
| `test/integration/route/task/compare.js` | Integration tests for `GET /:id/compare` |
| `test/integration/route/task/override.js` | Integration tests for the override POST routes |

---

## Data Layer

### `data/heuristic-impact.js`

The file exports `getHeuristicImpact()` returning a frozen object. Mapping strategy: take `segments.slice(4).join('.')`, split on `,`, drop sub-qualifiers via `token.split('.')[0]`, look up base ID then prefix fallback, else `{ category: 'General', rank: 4 }`.

Full table:

```js
module.exports = function getHeuristicImpact() {
  return Object.freeze({
    'ARIA':  { category: 'Screen-Reader Blocking', rank: 1 },
    'H37':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H36':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H67':   { category: 'Screen-Reader Blocking', rank: 1 },
    'G94':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H24':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H53':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H35':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H57':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H58':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H30':   { category: 'Screen-Reader Blocking', rank: 1 },
    'H4':    { category: 'Keyboard Navigation', rank: 2 },
    'H91':   { category: 'Keyboard Navigation', rank: 2 },
    'H44':   { category: 'Keyboard Navigation', rank: 2 },
    'H65':   { category: 'Keyboard Navigation', rank: 2 },
    'H32':   { category: 'Keyboard Navigation', rank: 2 },
    'H64':   { category: 'Keyboard Navigation', rank: 2 },
    'SCR20': { category: 'Keyboard Navigation', rank: 2 },
    'SCR33': { category: 'Keyboard Navigation', rank: 2 },
    'SCR39': { category: 'Keyboard Navigation', rank: 2 },
    'F10':   { category: 'Keyboard Navigation', rank: 2 },
    'F99':   { category: 'Keyboard Navigation', rank: 2 },
    'G149':  { category: 'Keyboard Navigation', rank: 2 },
    'G165':  { category: 'Keyboard Navigation', rank: 2 },
    'G195':  { category: 'Keyboard Navigation', rank: 2 },
    'C15':   { category: 'Keyboard Navigation', rank: 2 },
    'SCR31': { category: 'Keyboard Navigation', rank: 2 },
    'G18':   { category: 'Colour Contrast', rank: 3 },
    'G17':   { category: 'Colour Contrast', rank: 3 },
    'G145':  { category: 'Colour Contrast', rank: 3 },
    'G148':  { category: 'Colour Contrast', rank: 3 },
    'G156':  { category: 'Colour Contrast', rank: 3 },
    'G175':  { category: 'Colour Contrast', rank: 3 },
    'F24':   { category: 'Colour Contrast', rank: 3 },
    'G14':   { category: 'Colour Contrast', rank: 3 },
    'G182':  { category: 'Colour Contrast', rank: 3 },
    'G207':  { category: 'Colour Contrast', rank: 3 },
    'G209':  { category: 'Colour Contrast', rank: 3 },
    'C40':   { category: 'Colour Contrast', rank: 3 },
    'H42':   { category: 'General', rank: 4 },
    'H43':   { category: 'General', rank: 4 },
    'H48':   { category: 'General', rank: 4 },
    'H49':   { category: 'General', rank: 4 },
    'H63':   { category: 'General', rank: 4 },
    'H71':   { category: 'General', rank: 4 },
    'H73':   { category: 'General', rank: 4 },
    'H77':   { category: 'General', rank: 4 },
    'H78':   { category: 'General', rank: 4 },
    'H79':   { category: 'General', rank: 4 },
    'H80':   { category: 'General', rank: 4 },
    'H81':   { category: 'General', rank: 4 },
    'H83':   { category: 'General', rank: 4 },
    'H85':   { category: 'General', rank: 4 },
    'H90':   { category: 'General', rank: 4 },
    'H93':   { category: 'General', rank: 4 },
    'G57':   { category: 'General', rank: 4 },
    'G61':   { category: 'General', rank: 4 },
    'G83':   { category: 'General', rank: 4 },
    'G84':   { category: 'General', rank: 4 },
    'G85':   { category: 'General', rank: 4 },
    'G89':   { category: 'General', rank: 4 },
    'G97':   { category: 'General', rank: 4 },
    'G98':   { category: 'General', rank: 4 },
    'G130':  { category: 'General', rank: 4 },
    'G131':  { category: 'General', rank: 4 },
    'G141':  { category: 'General', rank: 4 },
    'G177':  { category: 'General', rank: 4 },
    'G184':  { category: 'General', rank: 4 },
    'G197':  { category: 'General', rank: 4 },
    'F77':   { category: 'General', rank: 4 },
    'H25':   { category: 'General', rank: 4 },
    'H39':   { category: 'General', rank: 4 },
    'H40':   { category: 'General', rank: 4 },
    'H69':   { category: 'General', rank: 4 },
    'H2':    { category: 'General', rank: 4 },
    'G5':    { category: 'Informational', rank: 5 },
    'G8':    { category: 'Informational', rank: 5 },
    'G9':    { category: 'Informational', rank: 5 },
    'G19':   { category: 'Informational', rank: 5 },
    'G54':   { category: 'Informational', rank: 5 },
    'G69':   { category: 'Informational', rank: 5 },
    'G78':   { category: 'Informational', rank: 5 },
    'G81':   { category: 'Informational', rank: 5 },
    'G87':   { category: 'Informational', rank: 5 },
    'G93':   { category: 'Informational', rank: 5 },
    'G150':  { category: 'Informational', rank: 5 },
    'G151':  { category: 'Informational', rank: 5 },
    'G157':  { category: 'Informational', rank: 5 },
    'G158':  { category: 'Informational', rank: 5 },
    'G159':  { category: 'Informational', rank: 5 },
    'G160':  { category: 'Informational', rank: 5 },
    'G166':  { category: 'Informational', rank: 5 },
    'G173':  { category: 'Informational', rank: 5 },
    'F40':   { category: 'Informational', rank: 5 },
    'F41':   { category: 'Informational', rank: 5 },
    'F4':    { category: 'Informational', rank: 5 },
    'F47':   { category: 'Informational', rank: 5 },
    'SCR22': { category: 'Informational', rank: 5 },
  });
};
```

**Lookup strategy (pseudocode):**

```
function deriveImpact(ruleCode, table):
  segments = ruleCode.split('.')
  if segments.length < 5: return { category: 'General', rank: 4 }
  techniqueString = segments.slice(4).join('.')
  tokens = techniqueString.split(',').map(t => t.trim())
  for each token in tokens:
    baseId = token.split('.')[0].trim()
    if table[baseId] exists: return table[baseId]
    prefix = leadingLetters(baseId)
    if table[prefix] exists: return table[prefix]
  return { category: 'General', rank: 4 }
```

---

### `data/remediation-guidance.js`

Lookup mirrors heuristic-impact: `segments.slice(4).join('.')`, split on `,`, `token.split('.')[0]` as base key, fallback `null`.

```js
{
  [techniqueId: string]: {
    steps:   string,
    example: string
  }
}
```

Three example entries:

```js
module.exports = function getRemediationGuidance() {
  return {
    'H37': {
      steps: [
        '1. Locate the <img> element in the source.',
        '2. Add an alt attribute that concisely describes the image content or its function.',
        '3. If the image is decorative and conveys no information, use alt="" (empty string).',
        '4. If the image is complex (chart, diagram), also provide a longer text description nearby.'
      ].join('\n'),
      example: '<img src="logo.png" alt="Acme Corporation logo">'
    },
    'H44': {
      steps: [
        '1. Ensure every <input>, <select>, and <textarea> has a matching <label>.',
        '2. Set the label\'s for attribute to exactly the id of the control.',
        '3. The id must be unique within the page.',
        '4. Place the label immediately before (or after, for checkboxes/radios) the control.',
        '5. If a visible label is not possible, use aria-label or aria-labelledby instead.'
      ].join('\n'),
      example: '<label for="email">Email address</label>\n<input type="email" id="email" name="email" autocomplete="email">'
    },
    'G18': {
      steps: [
        '1. Identify the foreground text colour and the background colour behind it.',
        '2. Use a contrast checker to measure the ratio.',
        '3. Normal text requires at least 4.5:1.',
        '4. Large text requires at least 3:1.',
        '5. Adjust colours until the threshold is met.',
        '6. Verify readability in high-contrast mode.'
      ].join('\n'),
      example: '/* After fix: colour #696969 on #ffffff = 4.61:1 (passes AA) */\n.body-text { color: #696969; background-color: #ffffff; }'
    }
  };
};
```

---

### Priority Override Storage

**Chosen mechanism: local JSON file (`data/overrides.json`)**

**Justification:** The pa11y-webservice client exposes no general-purpose collection API. A flat JSON file is sufficient for the expected volume, survives process restarts, requires no new npm packages, and follows the existing pattern of `data/` files. Concurrent writes are guarded by atomic read-modify-write using a temporary file and rename, ensuring the live file is never left in a partially-written state. `data/overrides.json` MUST be added to `.gitignore`; it is runtime-specific and must not be committed.

**Schema:**

```json
{
  "taskId:ruleCode": {
    "taskId":    "abc000000000000000000001",
    "ruleCode":  "WCAG2AA.Principle1.Guideline1_1.1_1_1.H37",
    "level":     "Critical",
    "reason":    "Confirmed by audit.",
    "updatedAt": "2024-06-01T09:00:00.000Z"
  }
}
```

**`lib/overrides.js` API surface:**

```js
/**
 * - ENOENT: returns {}
 * - Any other error: throws (not silently treated as empty)
 */
function readAll(): object

function get(taskId, ruleCode): object | null

/**
 * Atomic write:
 *   1. Serialise to JSON
 *   2. fs.writeFileSync to overrides.json.tmp
 *   3. fs.renameSync to overrides.json
 * Throws if level invalid or reason empty.
 */
function set(taskId, ruleCode, level, reason): void

function remove(taskId, ruleCode): void  // no-op if absent
```

---

## Prioritisation Engine (`lib/prioritise.js`)

### Function Signature

```js
/**
 * @param {object[]} groupedRules  Each: { code, type, count, items[], solutions[], message }
 * @param {object}   overridesMap  keyed by ruleCode → override entry
 * @returns {object[]}
 */
function prioritise(groupedRules, overridesMap)
```

### Step-by-Step Algorithm

```
function prioritise(groupedRules, overridesMap):
  impactTable = getHeuristicImpact()
  return groupedRules.map(rule => annotateRule(rule, overridesMap, impactTable))

function annotateRule(rule, overridesMap, impactTable):
  impact        = deriveImpact(rule.code, impactTable)
  computedLevel = computeLevel(rule.type, rule.count)
  override      = overridesMap[rule.code] || null
  finalLevel    = override ? override.level : computedLevel
  firstItem     = rule.items[0] || {}
  confidence    = (isNonEmpty(firstItem.selector) && isNonEmpty(firstItem.context))
                  ? 'high-confidence' : 'low-confidence'
  return {
    ...rule,
    priorityLevel:      finalLevel,
    computedLevel,
    impactCategory:     impact.category,
    impactCategoryRank: impact.rank,
    confidence,
    isOverride:         Boolean(override),
    overrideReason:     override ? override.reason : null,
  }

function computeLevel(type, count):
  if type === 'error':   return 'High'
  if type === 'warning': return count >= 5 ? 'High' : 'Medium'
  if type === 'notice':  return 'Low'
  return 'Low'
```

### Integration into `view/presenter/result.js`

```
const overridesMap = buildOverridesMapForTask(result.task)
result.errors   = prioritise(result.errors,   overridesMap)
result.warnings = prioritise(result.warnings, overridesMap)
result.notices  = prioritise(result.notices,  overridesMap)

const remediationTable = getRemediationGuidance()
[result.errors, result.warnings, result.notices].forEach(groups => {
  groups.forEach(rule => {
    rule.remediation = lookupRemediation(rule.code, remediationTable)
    if (rule.remediation && rule.remediation.example) {
      rule.remediation.exampleEscaped = htmlEscape(rule.remediation.example)
    }
  })
})

function htmlEscape(str):
  return str
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#x27;')
```

`lookupRemediation` uses the same normalisation as `deriveImpact`: `segments.slice(4).join('.')`, split on `,`, `token.split('.')[0]`, fallback `null`.

---

## Comparison Engine (`lib/compare.js`)

### Function Signature

```js
function compare(earlier, later): ComparisonResult
```

### Four-Step Matching Algorithm

```
function compare(earlier, later):
  earlyPool = earlier.map(f => ({ ...f, _matched: false }))
  latePool  = later.map(f  => ({ ...f, _matched: false }))
  persistent = [], likelyResolved = [], newFindings = []

  // ── Step 1: Exact match — code + normalised selector ─────────────────────
  for each ef in earlyPool where !ef._matched AND isNonEmpty(ef.selector):
    lf = findFirst(latePool, lf =>
         !lf._matched AND isNonEmpty(lf.selector)
         AND lf.code === ef.code
         AND normalise(lf.selector) === normalise(ef.selector))
    if lf found:
      ef._matched = lf._matched = true
      persistent.push(classified(ef, lf, 'exact', null))

  // ── Step 2: Context-Fallback Match ───────────────────────────────────────
  // Both selectors present and non-empty but different.
  for each ef in earlyPool where !ef._matched AND isNonEmpty(ef.selector):
    normCtx   = normalise(ef.context)
    earlyDups = earlyPool.filter(x => x.code === ef.code AND normalise(x.context) === normCtx)
    lateCands = latePool.filter(x =>
                  !x._matched AND isNonEmpty(x.selector)
                  AND x.code === ef.code AND normalise(x.context) === normCtx)
    if earlyDups.length === 1 AND lateCands.length === 1:
      lf = lateCands[0]
      ef._matched = lf._matched = true
      persistent.push(classified(ef, lf, 'context-fallback', null))
    else if earlyDups.length > 1 OR lateCands.length > 1:
      ef._ambiguous = true

  // ── Step 3: Missing-selector context match ────────────────────────────────
  // Applies when selector is null/empty on EITHER side (early or late).
  // The early finding must have non-empty context to participate.
  // Same uniqueness and one-to-one requirements as step 2.
  for each ef in earlyPool where !ef._matched AND isNonEmpty(ef.context):
    normCtx   = normalise(ef.context)
    lateCands = latePool.filter(x =>
                  !x._matched
                  AND x.code === ef.code
                  AND normalise(x.context) === normCtx
                  AND (!isNonEmpty(ef.selector) OR !isNonEmpty(x.selector)))
    if lateCands.length === 0: continue
    earlyDups = earlyPool.filter(x =>
                  x.code === ef.code AND normalise(x.context) === normCtx)
    if earlyDups.length === 1 AND lateCands.length === 1:
      lf = lateCands[0]
      ef._matched = lf._matched = true
      persistent.push(classified(ef, lf, 'code-and-context', null))
    else if earlyDups.length > 1 OR lateCands.length > 1:
      ef._ambiguous = true

  // ── Step 4: Code-only match ───────────────────────────────────────────────
  for each ef in earlyPool where !ef._matched
                             AND !isNonEmpty(ef.selector)
                             AND !isNonEmpty(ef.context):
    lf = findFirst(latePool, lf =>
         !lf._matched AND !isNonEmpty(lf.selector) AND !isNonEmpty(lf.context)
         AND lf.code === ef.code)
    if lf found:
      ef._matched = lf._matched = true
      note = 'Imprecise match: both selector and context are absent. Uncertain whether same element.'
      persistent.push(classified(ef, lf, 'code-only', note))

  // ── Classify remaining ─────────────────────────────────────────────────────
  earlyPool.filter(ef => !ef._matched).forEach(ef => {
    const label = ef._ambiguous ? 'ambiguous' : 'unmatched'
    const note  = ef._ambiguous
      ? 'Multiple findings share the same rule code and context. Manual verification required.'
      : 'Not matched in later scan. May be resolved or selector may have changed.'
    likelyResolved.push(classified(ef, null, label, note))
  })
  latePool.filter(lf => !lf._matched).forEach(lf => {
    newFindings.push(classified(null, lf, 'unmatched', null))
  })
  return { likelyResolved, persistent, newFindings }

function classified(ef, lf, matchLabel, matchNote):
  source = ef || lf
  return {
    code:       source.code,
    type:       source.type,
    message:    source.message,
    selector:   source.selector,
    context:    source.context,
    matchLabel,
    matchNote,
    isPrecise:  matchLabel !== 'code-only',
  }
```

---

## Comparison Presenter (`view/presenter/compare.js`)

**Priority annotation in the presenter:**

```js
function annotateFindingArray(findings, overridesMap):
  grouped = {}
  findings.forEach(f => {
    if (!grouped[f.code]):
      grouped[f.code] = { code: f.code, type: f.type, message: f.message, count: 0, items: [], solutions: [] }
    grouped[f.code].count++
    grouped[f.code].items.push({ selector: f.selector, context: f.context })
  })
  groupedArray = Object.values(grouped)
  annotated = prioritise(groupedArray, overridesMap)
  annotatedByCode = {}
  annotated.forEach(g => { annotatedByCode[g.code] = g })
  return findings.map(f => ({
    ...f, ...annotatedByCode[f.code],
    selector: f.selector, context: f.context,
    matchLabel: f.matchLabel, matchNote: f.matchNote, isPrecise: f.isPrecise,
  }))

// In presentCompare():
comparison.likelyResolved = annotateFindingArray(comparison.likelyResolved, overridesMap)
comparison.persistent     = annotateFindingArray(comparison.persistent,     overridesMap)
comparison.newFindings    = annotateFindingArray(comparison.newFindings,     overridesMap)
```

---

## New Routes

### `route/task/compare.js`

Route: `GET /:id/compare`. Query params: `earlierId`, `laterId`.

1. Fetch task, earlier result (full:true), later result (full:true).
2. `compare(earlierResult.results, laterResult.results)` → `ComparisonResult`.
3. Build `overridesMap`. Call `presentCompare(comparison, task, overridesMap)`.
4. Render `compare` view with `earlierDate` and `laterDate` passed as formatted strings.

404 if params missing or fetch fails.

### `route/task/override.js`

- `POST /:id/override` — body: `{ rule, level, reason }`
- `POST /:id/override/remove` — body: `{ rule }`

**Registration in `app.js`:**

```js
require('./route/task/compare')(app);
require('./route/task/override')(app);
require('./route/task/index')(app);   // existing — must remain last
```

---

## View Layer

### Changes to `view/partial/result.html`

1. Sort control before each tab's rule card list.
2. `{{> priority-badge rule=this}}` in each `.panel-heading`.
3. `data-priority-order`, `data-impact-rank`, `data-count` on each `.panel`.
4. `{{> remediation rule=this}}` in each `.task-details`.

### `view/partial/priority-badge.html`

```html
<span class="priority-badge priority-badge--{{lower-case rule.priorityLevel}}"
      aria-label="Priority: {{rule.priorityLevel}}{{#if rule.isOverride}} (manual override){{/if}}">
  {{rule.priorityLevel}}
</span>
{{#if rule.isOverride}}
  <span class="priority-override-indicator" aria-label="Manually overridden">
    <span class="glyphicon glyphicon-pencil" aria-hidden="true"></span>
    <span class="sr-only">Manual override</span>
  </span>
  <span class="priority-override-reason text-muted small">{{rule.overrideReason}}</span>
{{/if}}
<span class="priority-impact-label text-muted small"
      title="Estimated impact category — not a confirmed user-impact measurement">
  {{rule.impactCategory}} (estimated impact)
</span>
<span class="priority-confidence-label text-muted small">{{rule.confidence}}</span>
{{#if (if-equal rule.type "notice")}}
  <span class="priority-type-disclaimer text-muted small">Informational — not a confirmed failure</span>
{{/if}}
{{#if (if-equal rule.type "warning")}}
  <span class="priority-type-disclaimer text-muted small">May require manual verification — not a confirmed failure</span>
{{/if}}
```

### `view/partial/remediation.html`

```html
{{#if rule.remediation}}
  <div class="remediation-guidance">
    <h4 class="subtitle">How to fix:</h4>
    <p class="remediation-steps">{{rule.remediation.steps}}</p>
    <h5 class="subtitle">Example:</h5>
    <pre><code>{{{rule.remediation.exampleEscaped}}}</code></pre>
  </div>
{{else}}
  <div class="remediation-guidance remediation-guidance--fallback">
    <h4 class="subtitle">How to fix:</h4>
    <p class="text-muted">
      No specific guidance is available for this rule.
      {{#if rule.solutions.length}}
        Refer to:
        {{#each rule.solutions}}
          <a href="{{url}}" target="_blank" rel="noopener">{{title}}</a>
        {{/each}}
      {{/if}}
    </p>
  </div>
{{/if}}
```

### `view/partial/task-compare-control.html`

Included once in `view/task/index.html` inside `{{#if results}}`, shown only when `hasMultipleResults` is true.

```html
{{#if hasMultipleResults}}
<div class="well compare-scans-control">
  <h2 class="h4">Compare two scans</h2>
  <form action="/{{task.id}}/compare" method="get" class="form-inline compare-form">
    <div class="form-group">
      <label for="compare-earlier">Earlier scan</label>
      <select id="compare-earlier" name="earlierId" class="form-control" required>
        {{#each allResults}}
          <option value="{{id}}">{{date-format date format="DD MMM YYYY HH:mm"}}</option>
        {{/each}}
      </select>
    </div>
    <div class="form-group">
      <label for="compare-later">Later scan</label>
      <select id="compare-later" name="laterId" class="form-control" required>
        {{#each allResults}}
          <option value="{{id}}">{{date-format date format="DD MMM YYYY HH:mm"}}</option>
        {{/each}}
      </select>
    </div>
    <button type="submit" class="btn btn-default">
      <span class="glyphicon glyphicon-transfer" aria-hidden="true"></span>
      Compare scans
    </button>
  </form>
  <p class="text-muted small">
    Select two different scans to see which issues have been resolved, which persist,
    and which are new. Results are inferred from automated data and are not verified fixes.
  </p>
</div>
{{/if}}
```

**Route changes to `route/task/index.js`** (additive only):
- Pass `allResults` — undeduplicated results array, each `{ id, date }`, for the select options.
- Pass `hasMultipleResults` — `results.length >= 2`.
- Pass `overrideError` — `request.query['override-error'] || null`.
- Pass `overrideErrorRule` — `request.query['rule'] || null`.

**Accessibility:** Both selects have explicit `<label>` elements. `method="get"` passes IDs as query params to `GET /:id/compare`. `required` on both selects.

### `view/partial/priority-override-form.html`

Included in each rule card's `.panel-body` in `view/partial/result.html`, after the priority badge and before remediation guidance. Suppressed entirely in readonly mode (matching ignore/unignore pattern).

```html
{{#unless readonly}}
<div class="priority-override-panel">
  {{#if rule.isOverride}}
    <p class="text-muted small">
      <strong>Manual override:</strong> {{rule.priorityLevel}}
      — <em>{{rule.overrideReason}}</em>
    </p>
    <form class="override-remove-form"
          action="/{{task.id}}/override/remove"
          method="post">
      <input type="hidden" name="rule" value="{{rule.code}}"/>
      <button type="submit"
              class="btn btn-link btn-sm link"
              aria-label="Remove priority override for rule {{rule.code}}">
        Remove override
      </button>
    </form>
  {{else}}
    <details class="override-details">
      <summary class="btn btn-link btn-sm link">Set priority override…</summary>
      <form class="override-set-form"
            action="/{{task.id}}/override"
            method="post"
            novalidate>
        <input type="hidden" name="rule" value="{{rule.code}}"/>
        <div class="form-group">
          <label for="override-level-{{rule.code}}">Priority level</label>
          <select id="override-level-{{rule.code}}"
                  name="level"
                  class="form-control input-sm"
                  required>
            <option value="">— select —</option>
            <option value="Critical">Critical</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div class="form-group">
          <label for="override-reason-{{rule.code}}">Reason (required)</label>
          <input type="text"
                 id="override-reason-{{rule.code}}"
                 name="reason"
                 class="form-control input-sm"
                 placeholder="Describe why this priority level applies"
                 required
                 aria-required="true"/>
          {{#if overrideError}}
            <span class="help-block text-danger"
                  role="alert"
                  id="override-reason-error-{{rule.code}}"
                  aria-live="assertive">
              {{overrideError}}
            </span>
          {{/if}}
        </div>
        <button type="submit" class="btn btn-default btn-sm">Save override</button>
      </form>
    </details>
  {{/if}}
</div>
{{/unless}}
```

**Route behaviour for `POST /:id/override`:**
- Invalid input: redirect to `/:id?override-error=1&rule=<ruleCode>`. Task page presenter populates `overrideError` on the matching rule group.
- Success: redirect to `/:id?rule-overridden=1` (following the `?rule-ignored=1` pattern).
- `POST /:id/override/remove`: always succeeds; redirect to `/:id?override-removed=1`.

**Accessibility:** All controls have `<label for="...">`. Error uses `role="alert"` and `aria-live="assertive"`. `<details>`/`<summary>` is natively keyboard-accessible. Remove button has `aria-label` including rule code. Entire panel suppressed via `{{#unless readonly}}`.

#### Changes to `route/task/index.js` (summary)

```
// Additive additions to the existing render() call:
allResults:         results.map(r => ({ id: r.id, date: new Date(r.date) })),
hasMultipleResults: results.length >= 2,
overrideError:      request.query['override-error'] || null,
overrideErrorRule:  request.query['rule'] || null,
```

The existing `results` (deduplicated by `presentResultList`) remains unchanged.

### `view/compare.html`

```html
{{#content "title"}}Pa11y Dashboard — Scan Comparison — {{task.name}}{{/content}}
{{> result-header}}
<div class="col-md-12">
  <div class="alert alert-info comparison-disclaimer" role="note">
    <strong>Note:</strong>
    Comparison results are inferred from automated scan data. A finding classified as
    'Likely Resolved' may still exist if its element selector changed between scans.
  </div>
  <section aria-labelledby="resolved-heading">
    <h2 id="resolved-heading">Likely Resolved (not verified) <span class="badge">{{totalResolved}}</span></h2>
    {{#each likelyResolved}}{{> compare-finding-row finding=this}}{{/each}}
  </section>
  <section aria-labelledby="persistent-heading">
    <h2 id="persistent-heading">Persistent <span class="badge">{{totalPersistent}}</span></h2>
    {{#each persistent}}{{> compare-finding-row finding=this}}{{/each}}
  </section>
  <section aria-labelledby="new-heading">
    <h2 id="new-heading">New <span class="badge">{{totalNew}}</span></h2>
    {{#each newFindings}}{{> compare-finding-row finding=this}}{{/each}}
  </section>
</div>
```

### `view/partial/compare-finding-row.html`

```html
<div class="panel panel-default compare-finding"
     aria-label="{{finding.code}} — Priority: {{finding.priorityLevel}}">
  <div class="panel-heading">
    <span class="rule-name">{{finding.code}}</span>
    {{> priority-badge rule=finding}}
    {{#if finding.matchNote}}
      <span class="match-label label label-warning">{{finding.matchLabel}}</span>
      <span class="match-note text-muted small">{{finding.matchNote}}</span>
    {{/if}}
  </div>
  <div class="panel-body">
    <p>{{finding.message}}</p>
    {{#if finding.selector}}<code class="code">{{finding.selector}}</code>{{/if}}
  </div>
</div>
```

---

## Client-Side Sort (`public/js/site.js`)

Data attributes on each `.panel`: `data-priority-order` (0–3), `data-impact-rank` (1–5), `data-count`.

Sort comparator: `priorityOrder ASC → impactRank ASC → count DESC`. `aria-pressed` toggles; original order stored in `data-orig-index`.

---

## Accessible UI Patterns

### Priority Badge Colours

The following colours have been verified to pass WCAG 2.1 AA 4.5:1 for normal text (white on colour background). Ratios computed using the WCAG sRGB formula (linearisation: `c ≤ 0.04045 ? c/12.92 : ((c+0.055)/1.055)^2.4`; luminance: `0.2126R + 0.7152G + 0.0722B`; ratio: `(L_lighter+0.05)/(L_darker+0.05)`):

| Level    | Background | Text      | Verified ratio | Non-colour indicator  |
|----------|------------|-----------|----------------|-----------------------|
| Critical | `#c0392b`  | `#ffffff` | **5.44:1** ✅  | Label text "Critical" |
| High     | `#c2410c`  | `#ffffff` | **5.18:1** ✅  | Label text "High"     |
| Medium   | `#15803d`  | `#ffffff` | **5.02:1** ✅  | Label text "Medium"   |
| Low      | `#1d4ed8`  | `#ffffff` | **6.70:1** ✅  | Label text "Low"      |

Colours are from the Tailwind CSS v3 palette (public, well-known system): deep red (Critical), dark burnt-orange (High), forest green (Medium), cobalt blue (Low). Each level is visually distinct.

These colours are implemented in `public/css/priority.css` (referenced by the `<link>` tag in `view/layout/default.html`):

```css
/* Priority badge colours — verified WCAG AA 4.5:1 against #ffffff */
.priority-badge--critical { background-color: #c0392b; color: #ffffff; }
.priority-badge--high     { background-color: #c2410c; color: #ffffff; }
.priority-badge--medium   { background-color: #15803d; color: #ffffff; }
.priority-badge--low      { background-color: #1d4ed8; color: #ffffff; }
```

### Sort Control ARIA

Sort button uses `aria-pressed`. `aria-live="polite"` on sort note.

### Comparison Section Landmarks

`<section aria-labelledby="...heading">` pattern.

### Override Form Controls

- `<label for="...">` on every input
- `aria-describedby` pointing to inline validation error
- `role="alert"` on error message container

---

## Test File Layout

### Unit Tests

| File | Covers |
|---|---|
| `test/unit/lib/prioritise.js` | type→level mapping; count threshold (4,5,6); all impact categories; confidence indicator; override supremacy; Impact Category Rank |
| `test/unit/lib/compare.js` | four matching steps; uniqueness guard; ambiguous match; unmatched; null/empty selector and context; Step 3 fires when early selector present but late selector missing; Step 3 fires when early selector missing; Step 3 does NOT fire when both selectors present; Step 3 requires non-empty context on both sides |
| `test/unit/lib/overrides.js` | readAll() missing file; set() validation; get(); remove(); atomic write |
| `test/unit/data/heuristic-impact.js` | correct category/rank per technique ID; fallback General rank 4 |

### Integration Tests

| File | Covers |
|---|---|
| `test/integration/route/task/compare.js` | 200 with valid params; 404 on missing params; disclaimer text; three section headings |
| `test/integration/route/task/override.js` | POST creates override; redirect; POST remove deletes; validation rejects empty reason; readonly suppresses controls |

---

## Property-Based Correctness Properties

### Prioritisation Engine

**P1 — Totality:** Same-length output, no undefined/null entries.
**P2 — Type mapping:** error→High; notice→Low; warning≥5→High; warning<5→Medium.
**P3 — No automatic Critical:** Without overrides, no output has `priorityLevel === 'Critical'`.
**P4 — Override supremacy:** Override level is used; `isOverride === true`.
**P5 — Confidence correctness:** Both non-empty → `high-confidence`; else `low-confidence`.
**P6 — Impact Category Rank range:** Always in {1,2,3,4,5}.
**P7 — Sort order:** Stable and deterministic for same input.

### Comparison Engine

**P8 — Total coverage:** Every early finding in exactly one of likelyResolved/persistent; every late finding in exactly one of persistent/newFindings.
**P9 — One-to-one matching:** Each finding matched to at most one counterpart.
**P10 — Step-2 selector guard:** context-fallback only when both selectors non-empty.
**P11 — Ambiguous match exclusion:** `_ambiguous` findings never in persistent.
**P12 — Step-3 missing-selector guard:** A `code-and-context` match (step 3) is only produced when at least one of `ef.selector` or `lf.selector` is null or empty, AND both `ef.context` and `lf.context` are non-empty and equal after normalisation.
