// This file is part of Pa11y Dashboard.
//
// Pa11y Dashboard is free software: you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation, either version 3 of the License, or
// (at your option) any later version.
//
// Pa11y Dashboard is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License
// along with Pa11y Dashboard.  If not, see <http://www.gnu.org/licenses/>.

'use strict';

function isNonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

function normalise(value) {
	if (!isNonEmpty(value)) {
		return '';
	}
	return value.trim().toLowerCase();
}

// Build a ClassifiedFinding from an early and/or late finding.
function classified(earlyFinding, lateFinding, matchLabel, matchNote) {
	const source = earlyFinding || lateFinding;
	return {
		code: source.code,
		type: source.type,
		message: source.message,
		selector: source.selector,
		context: source.context,
		matchLabel,
		matchNote,
		isPrecise: matchLabel !== 'code-only'
	};
}

const AMBIGUOUS_NOTE = 'Multiple findings share the same rule code and context. ' +
'This finding could not be uniquely matched. Manual verification required.';
const UNMATCHED_NOTE = 'This finding was not matched in the later scan. ' +
'It may have been resolved or its element selector may have changed.';
const CODE_ONLY_NOTE = 'Imprecise match: both selector and context are absent. ' +
'It is uncertain whether these findings refer to the same element.';

// Compare two arrays of raw Pa11y findings and classify each finding.
//
// Four-step matching precedence:
// 1. Exact match: code + normalised selector (both non-empty)
// 2. Context-Fallback: both selectors non-empty but differ; match on code + normalised
//    context; only when exactly one candidate in each pool (else mark ambiguous)
// 3. Missing-selector context match: selector null/empty on EITHER side;
//    match on code + normalised context; same uniqueness guard
// 4. Code-only: both selector and context null/empty; match by code alone (imprecise)
//
// The algorithm is intentionally multi-step; complexity/statement/continue rules are
// relaxed for this single function.
/* eslint-disable complexity, max-statements, no-continue, no-underscore-dangle */
function compare(earlier, later) {
	const earlyPool = (earlier || []).map(finding => Object.assign({}, finding, {
		_matched: false,
		_ambiguous: false
	}));
	const latePool = (later || []).map(finding => Object.assign({}, finding, {
		_matched: false
	}));
	const persistent = [];
	const likelyResolved = [];
	const newFindings = [];

	// Step 1: Exact match - code + normalised selector.
	for (const earlyFinding of earlyPool) {
		if (earlyFinding._matched || !isNonEmpty(earlyFinding.selector)) {
			continue;
		}
		const normSelector = normalise(earlyFinding.selector);
		const lateFinding = latePool.find(candidate =>
			!candidate._matched &&
isNonEmpty(candidate.selector) &&
candidate.code === earlyFinding.code &&
normalise(candidate.selector) === normSelector
		);
		if (lateFinding) {
			earlyFinding._matched = true;
			lateFinding._matched = true;
			persistent.push(classified(earlyFinding, lateFinding, 'exact', null));
		}
	}

	// Step 2: Context-Fallback match. Both selectors present and non-empty but differ.
	for (const earlyFinding of earlyPool) {
		if (earlyFinding._matched || !isNonEmpty(earlyFinding.selector)) {
			continue;
		}
		if (!isNonEmpty(earlyFinding.context)) {
			continue;
		}
		const normContext = normalise(earlyFinding.context);
		const earlyDups = earlyPool.filter(candidate =>
			candidate.code === earlyFinding.code && normalise(candidate.context) === normContext
		);
		const lateCands = latePool.filter(candidate =>
			!candidate._matched &&
isNonEmpty(candidate.selector) &&
candidate.code === earlyFinding.code &&
normalise(candidate.context) === normContext
		);
		if (earlyDups.length === 1 && lateCands.length === 1) {
			const lateFinding = lateCands[0];
			earlyFinding._matched = true;
			lateFinding._matched = true;
			persistent.push(classified(earlyFinding, lateFinding, 'context-fallback', null));
		} else if (earlyDups.length > 1 || lateCands.length > 1) {
			earlyFinding._ambiguous = true;
		}
	}

	// Step 3: Missing-selector context match. Selector null/empty on EITHER side;
	// the early finding must have non-empty context to participate.
	for (const earlyFinding of earlyPool) {
		if (earlyFinding._matched) {
			continue;
		}
		if (!isNonEmpty(earlyFinding.context)) {
			continue;
		}
		const normContext = normalise(earlyFinding.context);
		const lateCands = latePool.filter(candidate =>
			!candidate._matched &&
candidate.code === earlyFinding.code &&
normalise(candidate.context) === normContext &&
(!isNonEmpty(earlyFinding.selector) || !isNonEmpty(candidate.selector))
		);
		if (lateCands.length === 0) {
			continue;
		}
		const earlyDups = earlyPool.filter(candidate =>
			candidate.code === earlyFinding.code && normalise(candidate.context) === normContext
		);
		if (earlyDups.length === 1 && lateCands.length === 1) {
			const lateFinding = lateCands[0];
			earlyFinding._matched = true;
			lateFinding._matched = true;
			persistent.push(classified(earlyFinding, lateFinding, 'code-and-context', null));
		} else if (earlyDups.length > 1 || lateCands.length > 1) {
			earlyFinding._ambiguous = true;
		}
	}

	// Step 4: Code-only match. Only when both selector and context are null/empty on the
	// early finding. One-to-one in pool order.
	for (const earlyFinding of earlyPool) {
		if (earlyFinding._matched) {
			continue;
		}
		if (isNonEmpty(earlyFinding.selector) || isNonEmpty(earlyFinding.context)) {
			continue;
		}
		const lateFinding = latePool.find(candidate =>
			!candidate._matched &&
!isNonEmpty(candidate.selector) &&
!isNonEmpty(candidate.context) &&
candidate.code === earlyFinding.code
		);
		if (lateFinding) {
			earlyFinding._matched = true;
			lateFinding._matched = true;
			persistent.push(classified(earlyFinding, lateFinding, 'code-only', CODE_ONLY_NOTE));
		}
	}

	// Classify remaining unmatched early findings.
	for (const earlyFinding of earlyPool) {
		if (earlyFinding._matched) {
			continue;
		}
		const label = earlyFinding._ambiguous ? 'ambiguous' : 'unmatched';
		const note = earlyFinding._ambiguous ? AMBIGUOUS_NOTE : UNMATCHED_NOTE;
		likelyResolved.push(classified(earlyFinding, null, label, note));
	}

	// Classify unmatched late findings as new.
	for (const lateFinding of latePool) {
		if (!lateFinding._matched) {
			newFindings.push(classified(null, lateFinding, 'unmatched', null));
		}
	}

	return {
		likelyResolved,
		persistent,
		newFindings
	};
}
/* eslint-enable complexity, max-statements, no-continue, no-underscore-dangle */

module.exports = {compare};
