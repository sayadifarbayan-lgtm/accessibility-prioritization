# Requirements Document

## Introduction

This feature extends the existing Pa11y Dashboard with impact-based issue prioritisation and guided remediation capabilities. The dashboard currently displays accessibility findings grouped by type (error, warning, notice) and sorted by recurrence count. This extension adds four capabilities without replacing or removing any existing functionality:

1. A deterministic, server-side algorithm that assigns each distinct rule (grouped by `code`) a four-tier priority level (Critical, High, Medium, Low).
2. Inline display of priority on existing result and task pages with an optional sort-by-priority control.
3. Practical, step-by-step remediation guidance with safe HTML/ARIA code examples displayed inside the existing collapsible details section.
4. A scan comparison view for any task that classifies findings across two stored results as resolved, persistent, or new.

The implementation must not add npm dependencies beyond those already declared in `package.json`, must preserve all existing integration tests, and must carry GPL-3.0 licence headers on every new file.

---

## Glossary

- **Priority Level**: A four-tier classification (Critical, High, Medium, Low) assigned to a distinct rule code within a scan result, computed deterministically from issue type, recurrence count, and functional impact category.
- **Heuristic Impact**: An estimated functional impact category (Screen-Reader Blocking, Keyboard Navigation, Colour Contrast, Informational, or General) derived from the rule code without external API calls; it is an estimation, not a confirmed user-impact measurement.
- **Impact Category Rank**: A deterministic integer rank assigned to each Heuristic Impact category for within-level sorting, defined in the static Heuristic Impact lookup table. The ranking from highest to lowest urgency is: Screen-Reader Blocking = 1, Keyboard Navigation = 2, Colour Contrast = 3, General = 4, Informational = 5. This ranking is a heuristic estimate based on likely functional impact on assistive technology users; it is not a measurement of confirmed user impact.
- **Confirmed Failure**: An accessibility finding of type `error` that Pa11y has flagged as a definite violation of a WCAG success criterion.
- **Probable Issue**: An accessibility finding of type `warning` that Pa11y has flagged as a probable violation of a WCAG success criterion; it requires human verification before being treated as a confirmed failure.
- **Informational Finding**: An accessibility finding of type `notice` that requires human judgement to determine whether a violation exists; it is never labelled as a confirmed failure.
- **Imprecise Match**: A finding matched across two scan results by rule `code` alone because both `selector` and `context` are null or empty; labelled explicitly in the comparison output.
- **Scan Comparison**: A view for a single task that shows the difference between two selected stored scan results, classifying each distinct finding as likely resolved, persistent, or new; this classification is inferred from automated scan data and is not proof that a fix has been applied or verified.
- **Prioritisation Engine**: The pure server-side module responsible for computing Priority Level from Pa11y finding data; it makes no external API calls and produces the same output for the same input on every invocation.
- **Remediation Guidance**: Static, human-authored step-by-step instructions and a safe HTML/ARIA code example for a given rule code, stored in a server-side data file.
- **Confidence Indicator**: A flag computed alongside the Priority Level that reflects data completeness for a finding. Values: `high-confidence` (both `selector` and `context` are non-null and non-empty, indicating the finding is well-located in the page) and `low-confidence` (selector or context is null or empty, indicating limited location data). The Confidence Indicator reflects how precisely the finding is located in the page source; it does not indicate confirmed user impact and does not determine the computed Priority Level.
- **Context-Fallback Match**: A match between two findings achieved by rule `code` and normalised (trimmed, lowercased) `context` when both selectors are present and non-empty but do not match. A Context-Fallback Match is only accepted when exactly one finding in each scan shares that code and normalised context; if multiple findings share the same code and context in either scan, the match is considered ambiguous and is not performed.

---

## Requirements

### Requirement 1: Priority Level Computation

**User Story:** As a developer, I want each distinct accessibility rule in a scan result to be assigned a priority level automatically, so that I can focus remediation effort on the most impactful issues first.

#### Acceptance Criteria

1. THE Prioritisation_Engine SHALL assign exactly one of the four Priority Levels — Critical, High, Medium, or Low — to every distinct rule code present in a scan result.
2. WHEN computing a Priority Level and its within-level sort position, THE Prioritisation_Engine SHALL consider the following inputs in order: (a) the Pa11y finding type (`error` > `warning` > `notice`), (b) the Heuristic Impact category derived from the rule code and its associated Impact Category Rank, and (c) the recurrence count of that code within the result.
3. THE Prioritisation_Engine SHALL apply the following deterministic mapping: a rule of type `error` with Heuristic Impact `Screen-Reader Blocking` or `Keyboard Navigation` SHALL receive Priority Level `High`; a rule of type `error` with any other Heuristic Impact SHALL receive Priority Level `High`; (net effect: all `error` findings receive `High` by default from the algorithm); a rule of type `warning` with recurrence count ≥ 5 SHALL receive `High` as a probable issue requiring verification; a rule of type `warning` with recurrence count < 5 SHALL receive `Medium` as a probable issue requiring verification; a rule of type `notice` SHALL receive `Low` regardless of recurrence count or Heuristic Impact category; Priority Level `Critical` SHALL NOT be assigned by the algorithm and is reserved exclusively for manual overrides (see Requirement 2).
4. THE Prioritisation_Engine SHALL derive Heuristic Impact category from the rule code prefix according to a static lookup table stored in a server-side data file, with a fallback category of `General` for unrecognised prefixes.
5. THE Prioritisation_Engine SHALL be a pure function: given the same set of findings, it SHALL produce the same Priority Level output on every invocation.
6. THE Prioritisation_Engine SHALL make no external API calls during Priority Level computation.
7. WHEN a rule code is not present in the Heuristic Impact lookup table, THE Prioritisation_Engine SHALL assign the `General` Heuristic Impact category and continue computation without error.
8. THE Prioritisation_Engine SHALL handle a null or empty `selector` and a null or empty `context` on any finding without throwing an error.
9. THE Prioritisation_Engine SHALL compute and attach a Confidence Indicator to every priority result alongside the Priority Level, set to `high-confidence` when both `selector` and `context` are non-null and non-empty, and `low-confidence` otherwise.
10. THE Prioritisation_Engine SHALL attach an Impact Category Rank integer to every priority result, derived from the Impact Category Rank ordering defined in the Heuristic Impact lookup table. When a rule code maps to the `General` fallback category, the engine SHALL attach Impact Category Rank 4. The Impact Category Rank is used only for within-level display ordering and does not alter the assigned Priority Level.

---

### Requirement 2: Manual Priority Override

**User Story:** As a developer, I want to override the computed priority of a rule with a custom level and a stored reason, so that I can record project-specific risk decisions that differ from the algorithm's estimate.

#### Acceptance Criteria

1. WHEN a user submits a priority override for a rule code on a task, THE Dashboard SHALL store the override Priority Level and a non-empty reason string associated with that task and rule code.
2. WHEN a stored override exists for a rule code on a task, THE Prioritisation_Engine SHALL use the override Priority Level instead of the computed Priority Level for that rule code in all display and sort operations.
3. WHEN displaying a rule whose priority has been manually overridden, THE Dashboard SHALL visually distinguish the displayed priority as an override and SHALL show the stored reason text adjacent to the priority badge.
4. THE Dashboard SHALL accept override Priority Level values restricted to exactly: `Critical`, `High`, `Medium`, `Low`. `Critical` is only reachable via manual override and is not assigned by the Prioritisation Engine.
5. IF a submitted override reason is empty or blank, THEN THE Dashboard SHALL reject the submission and display an inline validation error message without navigating away from the page.
6. THE Dashboard SHALL provide a mechanism for a user to remove a stored override, restoring the computed Priority Level for that rule code on that task.
7. WHEN the readonly configuration flag is set to `true`, THE Dashboard SHALL suppress all override submission controls and SHALL treat the page as read-only, consistent with the existing readonly behaviour for ignore/unignore controls.

---

### Requirement 3: Priority Display on Result and Task Pages

**User Story:** As a developer, I want to see the priority level of each rule inline on the result and task pages, so that I can assess severity at a glance without navigating away.

#### Acceptance Criteria

1. THE Dashboard SHALL display the Priority Level badge for each rule code inside the existing rule card on the errors, warnings, and notices tabs of both the result page and the task page, without removing or replacing any existing information.
2. THE Dashboard SHALL render Priority Level badges using visually distinct styles per level: Critical, High, Medium, and Low SHALL each have a unique combination of colour and a non-colour indicator (distinct label text) so that the level is distinguishable without relying on colour alone.
3. THE Dashboard SHALL render Priority Level badge text and background colour combinations that achieve a colour contrast ratio of at least 4.5:1 as defined by WCAG 2.1 Success Criterion 1.4.3.
4. WHEN a rule's Priority Level has been manually overridden, THE Dashboard SHALL display an override indicator adjacent to the priority badge on the rule card.
5. THE Dashboard SHALL display the Heuristic Impact category label alongside the Priority Level badge for every rule card, with a visible notation that reads "estimated impact" to distinguish it from a confirmed measurement.
6. WHEN a finding has type `notice`, THE Dashboard SHALL display the text "Informational — not a confirmed failure" adjacent to its priority badge on the notices tab.
7. WHEN a finding has type `warning`, THE Dashboard SHALL display the text "May require manual verification — not a confirmed failure" adjacent to its priority badge on the warnings tab.
8. THE Dashboard SHALL display the Confidence Indicator for every rule card (e.g., a small label "High confidence" or "Low confidence") so that developers can see at a glance how much contextual evidence supports the assigned priority.
9. THE Dashboard SHALL preserve the existing ignore/unignore form controls on all rule cards unchanged when priority display elements are added.

---

### Requirement 4: Sort by Priority

**User Story:** As a developer, I want to sort rules within each tab by priority level, so that I can review the most critical issues first.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a "Sort by priority" control on the errors tab, the warnings tab, and the notices tab of the result page and the task page.
2. WHEN a user activates the "Sort by priority" control on a tab, THE Dashboard SHALL re-order the rule cards on that tab in descending Priority Level order: Critical first, then High, then Medium, then Low.
3. WHEN a user has not activated the "Sort by priority" control, THE Dashboard SHALL display rule cards in the existing count-descending order as the default.
4. THE Dashboard SHALL maintain the selected sort order independently per tab, so that changing the sort on one tab does not affect the sort order of another tab.
5. THE "Sort by priority" control SHALL be keyboard-accessible and SHALL have an accessible name that describes its action.
6. WHEN two or more rule codes share the same Priority Level under priority sort, THE Dashboard SHALL apply the following two-key tie-break in order: first, Impact Category Rank ascending (rank 1 = Screen-Reader Blocking appears before rank 2 = Keyboard Navigation, and so on); second, recurrence count descending. THE Dashboard SHALL display a visible note adjacent to the sort control stating: "Within each priority level, rules are ordered by estimated impact category (heuristic) then by recurrence count."

---

### Requirement 5: Remediation Guidance Data

**User Story:** As a developer, I want step-by-step remediation guidance with a code example for each rule, so that I know what to change in the page source to fix the issue.

#### Acceptance Criteria

1. THE Dashboard SHALL store Remediation Guidance for known rule codes in a static server-side data file that maps rule code to: a step-by-step guidance text and a safe HTML/ARIA code example string.
2. WHEN Remediation Guidance is defined for a rule code, THE Dashboard SHALL render the step-by-step guidance text and the code example inside the existing collapsible details section of the rule card, appended after the existing solutions and selectors content.
3. WHEN no Remediation Guidance is defined for a rule code, THE Dashboard SHALL render a generic fallback message that includes the WCAG technique link already available for that rule, appended after the existing solutions and selectors content.
4. THE Dashboard SHALL HTML-escape all Remediation Guidance code example strings before inserting them into the DOM so that no code example causes script execution or alters page structure.
5. THE Dashboard SHALL render code examples inside a `<pre><code>` block to preserve formatting and to semantically mark them as code.
6. THE Remediation_Guidance_Data SHALL be defined in a server-side file using only constructs available in Node.js without additional npm packages, consistent with the existing `data/techniques.js` pattern.
7. IF a rule code has no associated WCAG technique link in `data/techniques.js`, THEN THE Dashboard SHALL render the generic fallback message without a technique link rather than rendering a broken or empty anchor element.

---

### Requirement 6: Remediation Guidance Display

**User Story:** As a developer, I want the remediation guidance to appear within the existing rule details panel, so that the UI remains consistent and I do not need to navigate to a separate page.

#### Acceptance Criteria

1. THE Dashboard SHALL display Remediation Guidance inside the existing collapsible `task-details` section of each rule card on the errors, warnings, and notices tabs without replacing the existing solutions list or selectors list.
2. WHEN the collapsible details section is collapsed, THE Dashboard SHALL not expose Remediation Guidance content to keyboard focus or screen reader traversal, consistent with the existing collapse behaviour.
3. THE Dashboard SHALL label the Remediation Guidance subsection with a visible heading or label so that a screen reader user can identify it as distinct from the solutions and selectors content.
4. WHEN a rule is of type `notice`, THE Dashboard SHALL prefix the Remediation Guidance with the text "This is an informational notice. Human review is required to determine whether a failure exists." before displaying any guidance text.
5. WHEN a rule is of type `warning`, THE Dashboard SHALL prefix the Remediation Guidance with the text "Pa11y has flagged this as a probable issue. Manual verification is recommended before treating it as a confirmed failure."

---

### Requirement 7: Scan Comparison View

**User Story:** As a developer, I want to compare any two stored scan results for a task side by side, so that I can verify which issues have been resolved, which persist, and which are new since the earlier scan.

#### Acceptance Criteria

1. THE Dashboard SHALL provide a "Compare scans" control on the task page that is visible when the task has two or more stored results.
2. WHEN a user activates the "Compare scans" control, THE Dashboard SHALL present a selection mechanism allowing the user to choose exactly two results from the task's stored results list, identified by scan date.
3. WHEN a user submits a comparison request, THE Dashboard SHALL render a comparison view showing three labelled sections: "Likely Resolved (not verified)" (findings present in the earlier result but absent in the later), "Persistent" (findings present in both results), and "New" (findings absent in the earlier result but present in the later). THE Dashboard SHALL display a prominent disclaimer on the comparison view stating: "Comparison results are inferred from automated scan data. A finding classified as 'Likely Resolved' may still exist if its element selector changed between scans."
4. THE Comparison_Engine SHALL match findings across two results using the following four-step precedence: (1) exact match on rule `code` and trimmed, lowercased `selector` (both selectors must be non-empty and equal); (2) IF both selectors are non-empty but do not match, attempt a Context-Fallback Match: match on rule `code` and trimmed, lowercased `context`, accepted only when exactly one finding in the earlier scan and exactly one finding in the later scan share that code and normalised context — if multiple findings in either scan share the same code and normalised context, this step is skipped for those findings and they proceed to step 4; (3) IF `selector` is null or empty on either finding, match on rule `code` and trimmed, lowercased `context` snippet (the same uniqueness requirement as step 2 applies); (4) if both `selector` and `context` are null or empty on a finding, match on rule `code` alone (Imprecise Match).
5. WHEN a finding is matched by rule `code` alone under step 4 (both `selector` and `context` are null or empty), THE Dashboard SHALL label that finding as "imprecise match" in the comparison view and SHALL display explanatory text clarifying that an imprecise match increases uncertainty about whether the same element is being compared.
6. THE Dashboard SHALL include findings of type `notice` in the comparison output and SHALL label them as "Informational" in the comparison view; notices SHALL NOT be labelled as confirmed failures.
7. THE Dashboard SHALL display the Priority Level of each finding in the comparison view using the same badge styles defined in Requirement 3.
8. THE Dashboard SHALL provide a link or button in the comparison view that returns the user to the task page.
9. IF only one stored result exists for a task, THEN THE Dashboard SHALL not render the "Compare scans" control.
10. THE Dashboard SHALL register the comparison route following the existing Express route registration pattern in `app.js` and `route/`.
11. WHEN a finding present in the earlier scan cannot be matched in the later scan by steps 1, 2, 3, or 4, THE Comparison_Engine SHALL classify it as "Likely Resolved — possible selector change" rather than plain "Likely Resolved", and THE Dashboard SHALL display this sub-label in the comparison view.
12. WHEN a Context-Fallback Match (step 2 or step 3) is ambiguous — i.e., multiple findings in either scan share the same rule `code` and normalised `context` — THE Comparison_Engine SHALL NOT merge those findings. THE Dashboard SHALL display each unmerged finding with the label "Ambiguous match — manual verification required" and SHALL display explanatory text stating that the finding could not be uniquely matched due to duplicate code and context values.

---

### Requirement 8: Scan Comparison Accessibility and Labelling

**User Story:** As a developer, I want the comparison view to be fully accessible and clearly labelled, so that screen reader users can navigate and understand the output.

#### Acceptance Criteria

1. THE Dashboard SHALL render each of the three comparison sections ("Likely Resolved (not verified)", "Persistent", "New") as a labelled landmark region or a section with a visible heading so that screen reader users can navigate between sections.
2. THE Dashboard SHALL render finding rows in the comparison view with accessible names that include the rule code and its Priority Level.
3. WHEN a finding in the comparison view is labelled "imprecise match", THE Dashboard SHALL provide visible explanatory text describing what imprecise match means in context. WHEN a finding in the comparison view is labelled "Likely Resolved — possible selector change", THE Dashboard SHALL provide visible explanatory text describing that the finding could not be matched in the later scan and may still exist under a different selector. WHEN a finding in the comparison view is labelled "Ambiguous match — manual verification required", THE Dashboard SHALL provide visible explanatory text describing why the match is ambiguous.
4. THE Dashboard SHALL ensure that the scan date selection mechanism in the comparison view is operable by keyboard alone and has accessible labels on all form controls.

---

### Requirement 9: Automated Tests

**User Story:** As a developer, I want automated tests covering all new routes and logic, so that regressions are caught before deployment.

#### Acceptance Criteria

1. THE Test_Suite SHALL include Mocha integration tests for every new Express route added by this feature, following the existing test file structure in `test/integration/`.
2. THE Test_Suite SHALL include unit tests for the Prioritisation_Engine covering: (a) all `error` type findings produce `High`; `warning` findings at or above the recurrence count threshold (count ≥ 5) produce `High`; `warning` findings below the threshold (count < 5) produce `Medium`; `notice` findings always produce `Low`; the engine never produces `Critical` automatically; Confidence Indicator is attached correctly; (b) boundary conditions on the recurrence count threshold (count = 4, count = 5, count = 6); (c) behaviour when `selector` and `context` are null; (d) manual override of `Critical` is accepted and used in display; (e) the Impact Category Rank is attached correctly for each Heuristic Impact category including the `General` fallback (rank 4); within the same Priority Level, findings are ordered by Impact Category Rank ascending then recurrence count descending.
3. THE Test_Suite SHALL include unit tests for the Comparison_Engine covering: (a) the four matching precedences (exact selector match, context-fallback match with selector mismatch, context match with null/empty selector, code-alone match); (b) correct classification of findings into Likely Resolved (not verified), Persistent, and New; (c) the imprecise match flag is set only when both `selector` and `context` are null or empty; (d) Context-Fallback Match is accepted only when the code+context pair is unique in both scans; (e) ambiguous context matches are not merged and are labelled "Ambiguous match — manual verification required"; (f) the "Likely Resolved — possible selector change" sub-label is applied when no match is found across all four steps.
4. WHEN the full test suite is executed, THE Test_Suite SHALL pass all pre-existing integration tests without modification to any pre-existing test file.
5. THE Test_Suite SHALL use only the test libraries already present in `package.json` (Mocha, proclaim, cheerio) and SHALL not introduce additional testing dependencies.
6. THE Test_Suite SHALL carry GPL-3.0 licence headers on every new test file.

---

### Requirement 10: Non-Functional and Cross-Cutting Constraints

**User Story:** As a maintainer, I want all new code to conform to the existing project conventions and licence, so that the codebase remains consistent and legally compliant.

#### Acceptance Criteria

1. THE Dashboard SHALL carry a GPL-3.0 licence header comment at the top of every new source file, matching the format used in existing files.
2. THE Dashboard SHALL register all new Express routes in `app.js` following the existing `require('./route/...')` pattern, and all new presenter modules SHALL follow the existing pattern in `view/presenter/`.
3. THE Dashboard SHALL not introduce any npm dependency not already listed in `package.json` at the time of implementation.
4. WHEN `selector` or `context` is null or empty on any Pa11y finding, THE Dashboard SHALL handle that condition without throwing a runtime error at every layer: presenter, engine, comparison, and template.
5. THE Dashboard SHALL not display or label any finding of type `notice` as a confirmed accessibility failure at any point in the UI.
6. THE Dashboard SHALL not remove, hide, or alter any existing UI element, route, or presenter behaviour that was present before this feature was introduced.
7. WHEN the readonly configuration flag is set to `true`, THE Dashboard SHALL suppress all write controls introduced by this feature (priority override submission, comparison initiation that stores state) while continuing to display computed priority and guidance in read-only mode.
