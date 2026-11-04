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

const assert = require('proclaim');
const {compare} = require('../../../lib/compare');

// --- Helpers ---------------------------------------------------------------

// Build a single raw Pa11y finding with sensible defaults, overridable per test.
function finding(overrides) {
	return Object.assign({
		code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
		type: 'error',
		message: 'A sample message',
		selector: 'html > body > p',
		context: '<p>hi</p>'
	}, overrides || {});
}

// Locate a classified finding in a pool by its rule code.
function byCode(pool, code) {
	return pool.filter(f => f.code === code);
}

// --- Tests -----------------------------------------------------------------

describe('lib/compare', () => {

	it('exports a compare function', () => {
		assert.isFunction(compare);
	});

	describe('empty inputs', () => {
		it('returns all three arrays empty for compare([], [])', () => {
			const result = compare([], []);
			assert.deepEqual(result.likelyResolved, []);
			assert.deepEqual(result.persistent, []);
			assert.deepEqual(result.newFindings, []);
		});

		it('handles null/undefined inputs without throwing', () => {
			assert.doesNotThrow(() => compare(null, undefined));
			const result = compare(null, undefined);
			assert.deepEqual(result.likelyResolved, []);
			assert.deepEqual(result.persistent, []);
			assert.deepEqual(result.newFindings, []);
		});
	});

	// ── Step 1: Exact match ──────────────────────────────────────────────────
	describe('Step 1 — exact match (code + non-empty selector)', () => {
		it('matches same code + same selector into persistent with label "exact" and isPrecise true', () => {
			const early = [finding({code: 'A',
				selector: 'div > p'})];
			const later = [finding({code: 'A',
				selector: 'div > p'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.lengthEquals(result.likelyResolved, 0);
			assert.lengthEquals(result.newFindings, 0);
			assert.strictEqual(result.persistent[0].matchLabel, 'exact');
			assert.isTrue(result.persistent[0].isPrecise);
		});

		it('matches selectors that differ only by case/whitespace (normalised)', () => {
			const early = [finding({code: 'A',
				selector: 'DIV > P'})];
			const later = [finding({code: 'A',
				selector: '  div > p  '})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'exact');
		});

		it('does not exact-match when codes differ', () => {
			const early = [finding({code: 'A',
				selector: 'div > p'})];
			const later = [finding({code: 'B',
				selector: 'div > p'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 0);
			assert.lengthEquals(result.likelyResolved, 1);
			assert.lengthEquals(result.newFindings, 1);
		});
	});

	// ── Step 2: Context-fallback ─────────────────────────────────────────────
	describe('Step 2 — context-fallback (selectors present but differ)', () => {
		it('matches on code + context when selectors differ, labelled "context-fallback"', () => {
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: 'section > p',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'context-fallback');
			assert.isTrue(result.persistent[0].isPrecise);
		});

		it('P10 — does NOT context-fallback when late selector is empty (falls to step 3)', () => {
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: '',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			// Match still occurs, but via step 3, not step 2.
			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'code-and-context');
			assert.notStrictEqual(result.persistent[0].matchLabel, 'context-fallback');
		});
	});

	// ── Step 3: Missing-selector context match ───────────────────────────────
	describe('Step 3 — missing-selector context match', () => {
		it('matches when early selector present but late selector MISSING (same code + context)', () => {
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: null,
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'code-and-context');
		});

		it('matches when early selector MISSING but late selector present (same code + context)', () => {
			const early = [finding({code: 'A',
				selector: '',
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'code-and-context');
		});

		it('matches when both selectors MISSING but contexts present and equal', () => {
			const early = [finding({code: 'A',
				selector: null,
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: '',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'code-and-context');
		});

		it('P12 — does NOT match via step 3 when both selectors present (that is step-2 territory)', () => {
			// Same context, both selectors present & differing → must not be labelled code-and-context.
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: 'section > p',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.notStrictEqual(result.persistent[0].matchLabel, 'code-and-context');
			assert.strictEqual(result.persistent[0].matchLabel, 'context-fallback');
		});

		it('P12 — requires non-empty context: missing selector + empty context does not step-3 match', () => {
			const early = [finding({code: 'A',
				selector: null,
				context: ''})];
			const later = [finding({code: 'A',
				selector: null,
				context: ''})];
			const result = compare(early, later);

			// Both selector and context empty → this is step-4 (code-only), not step-3.
			assert.lengthEquals(result.persistent, 1);
			assert.notStrictEqual(result.persistent[0].matchLabel, 'code-and-context');
			assert.strictEqual(result.persistent[0].matchLabel, 'code-only');
		});

		it('P12 — does not match via step 3 when contexts differ', () => {
			const early = [finding({code: 'A',
				selector: null,
				context: '<p>x</p>'})];
			const later = [finding({code: 'A',
				selector: null,
				context: '<p>y</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 0);
			assert.lengthEquals(result.likelyResolved, 1);
			assert.lengthEquals(result.newFindings, 1);
		});
	});

	// ── Step 4: Code-only ─────────────────────────────────────────────────────
	describe('Step 4 — code-only imprecise match', () => {
		it('matches by code alone when both selector and context empty/null on both sides', () => {
			const early = [finding({code: 'A',
				selector: null,
				context: null})];
			const later = [finding({code: 'A',
				selector: '',
				context: ''})];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 1);
			assert.strictEqual(result.persistent[0].matchLabel, 'code-only');
			assert.isFalse(result.persistent[0].isPrecise);
			assert.include(result.persistent[0].matchNote.toLowerCase(), 'imprecise');
		});

		it('isPrecise is false ONLY for code-only matches', () => {
			const early = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>x</p>'}),
				finding({code: 'CTX',
					selector: 'div > p',
					context: '<p>y</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null})
			];
			const later = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>x</p>'}),
				finding({code: 'CTX',
					selector: 'section > p',
					context: '<p>y</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null})
			];
			const result = compare(early, later);

			assert.lengthEquals(result.persistent, 3);
			result.persistent.forEach(f => {
				if (f.matchLabel === 'code-only') {
					assert.isFalse(f.isPrecise);
				} else {
					assert.isTrue(f.isPrecise);
				}
			});
		});
	});

	// ── Resolved / New classification ─────────────────────────────────────────
	describe('resolved and new classification', () => {
		it('classifies an unmatched early finding as likelyResolved with label "unmatched"', () => {
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [];
			const result = compare(early, later);

			assert.lengthEquals(result.likelyResolved, 1);
			assert.strictEqual(result.likelyResolved[0].matchLabel, 'unmatched');
			assert.include(result.likelyResolved[0].matchNote.toLowerCase(), 'selector');
		});

		it('classifies an unmatched late finding as newFindings with label "unmatched"', () => {
			const early = [];
			const later = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const result = compare(early, later);

			assert.lengthEquals(result.newFindings, 1);
			assert.strictEqual(result.newFindings[0].matchLabel, 'unmatched');
		});
	});

	// ── P11: Ambiguity ──────────────────────────────────────────────────────
	describe('P11 — ambiguous match exclusion', () => {
		it('marks duplicates (same code+context) as "ambiguous" in likelyResolved and NOT persistent', () => {
			// Two early findings share code+context; two late findings too → ambiguous.
			const early = [
				finding({code: 'A',
					selector: 'div > p',
					context: '<li>dup</li>'}),
				finding({code: 'A',
					selector: 'div > span',
					context: '<li>dup</li>'})
			];
			const later = [
				finding({code: 'A',
					selector: 'section > p',
					context: '<li>dup</li>'}),
				finding({code: 'A',
					selector: 'section > span',
					context: '<li>dup</li>'})
			];
			const result = compare(early, later);

			// None of the ambiguous findings should be matched into persistent.
			assert.lengthEquals(result.persistent, 0);
			// The early ambiguous findings land in likelyResolved labelled 'ambiguous'.
			const ambiguous = byCode(result.likelyResolved, 'A');
			assert.lengthEquals(ambiguous, 2);
			ambiguous.forEach(f => {
				assert.strictEqual(f.matchLabel, 'ambiguous');
			});
		});

		it('ambiguous early findings never appear in persistent', () => {
			const early = [
				finding({code: 'A',
					selector: 'x1',
					context: '<li>dup</li>'}),
				finding({code: 'A',
					selector: 'x2',
					context: '<li>dup</li>'})
			];
			const later = [
				finding({code: 'A',
					selector: 'y1',
					context: '<li>dup</li>'}),
				finding({code: 'A',
					selector: 'y2',
					context: '<li>dup</li>'})
			];
			const result = compare(early, later);
			result.persistent.forEach(f => {
				assert.notStrictEqual(f.matchLabel, 'ambiguous');
			});
			assert.lengthEquals(result.persistent, 0);
		});
	});

	// ── P8: Total coverage ────────────────────────────────────────────────────
	describe('P8 — total coverage', () => {
		it('every early finding appears in exactly one of likelyResolved or persistent', () => {
			const early = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>a</p>'}),
				finding({code: 'CTX',
					selector: 'div > p',
					context: '<p>b</p>'}),
				finding({code: 'GONE',
					selector: 'span',
					context: '<p>c</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null})
			];
			const later = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>a</p>'}),
				finding({code: 'CTX',
					selector: 'section > p',
					context: '<p>b</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null}),
				finding({code: 'BRANDNEW',
					selector: 'nav',
					context: '<p>z</p>'})
			];
			const result = compare(early, later);

			assert.strictEqual(
				result.likelyResolved.length + result.persistent.length,
				early.length
			);
		});

		it('every late finding appears in exactly one of persistent or newFindings', () => {
			const early = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>a</p>'}),
				finding({code: 'CTX',
					selector: 'div > p',
					context: '<p>b</p>'}),
				finding({code: 'GONE',
					selector: 'span',
					context: '<p>c</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null})
			];
			const later = [
				finding({code: 'EXACT',
					selector: 'div',
					context: '<p>a</p>'}),
				finding({code: 'CTX',
					selector: 'section > p',
					context: '<p>b</p>'}),
				finding({code: 'ONLY',
					selector: null,
					context: null}),
				finding({code: 'BRANDNEW',
					selector: 'nav',
					context: '<p>z</p>'})
			];
			const result = compare(early, later);

			assert.strictEqual(
				result.persistent.length + result.newFindings.length,
				later.length
			);
		});
	});

	// ── P9: One-to-one matching ─────────────────────────────────────────────
	describe('P9 — one-to-one matching', () => {
		it('a single early finding matches at most one late finding', () => {
			// One early finding, two late candidates that could each exact-match.
			const early = [finding({code: 'A',
				selector: 'div > p',
				context: '<p>x</p>'})];
			const later = [
				finding({code: 'A',
					selector: 'div > p',
					context: '<p>x</p>'}),
				finding({code: 'A',
					selector: 'div > p',
					context: '<p>x</p>'})
			];
			const result = compare(early, later);

			// Exactly one persistent pairing; the surplus late finding is new.
			assert.lengthEquals(result.persistent, 1);
			assert.lengthEquals(result.newFindings, 1);
			assert.lengthEquals(result.likelyResolved, 0);
		});

		it('two late findings that could match one early: only one is paired', () => {
			const early = [finding({code: 'A',
				selector: 'div',
				context: '<p>x</p>'})];
			const later = [
				finding({code: 'A',
					selector: 'div',
					context: '<p>x</p>'}),
				finding({code: 'A',
					selector: 'div',
					context: '<p>x</p>'})
			];
			const result = compare(early, later);

			const persistentA = byCode(result.persistent, 'A');
			const newA = byCode(result.newFindings, 'A');
			assert.lengthEquals(persistentA, 1);
			assert.lengthEquals(newA, 1);
		});
	});

	// ── Null safety ───────────────────────────────────────────────────────────
	describe('null safety', () => {
		it('does not throw when findings have null selector and null context', () => {
			const early = [finding({code: 'A',
				selector: null,
				context: null})];
			const later = [finding({code: 'B',
				selector: null,
				context: null})];
			assert.doesNotThrow(() => compare(early, later));
		});

		it('does not throw with a mix of null and populated fields', () => {
			const early = [
				finding({code: 'A',
					selector: null,
					context: '<p>x</p>'}),
				finding({code: 'B',
					selector: 'div',
					context: null}),
				finding({code: 'C',
					selector: null,
					context: null})
			];
			const later = [
				finding({code: 'A',
					selector: 'div',
					context: '<p>x</p>'}),
				finding({code: 'B',
					selector: null,
					context: null})
			];
			assert.doesNotThrow(() => compare(early, later));
		});
	});


	// ── Controlled scan scenario: resolved + persistent + new together ──
	describe('controlled scan scenario (resolved, persistent, new)', () => {
		// An earlier scan and a later scan sharing a realistic mix of findings:
		// - two findings persist unchanged (exact selector match)
		// - one persists but its selector changed (context-fallback match)
		// - one persists matched by context when its selector went missing
		// - two findings are resolved (present earlier, absent later)
		// - two findings are new (absent earlier, present later)
		const earlier = [
			finding({code: 'PERSIST_1',
				selector: '#main > h1',
				context: '<h1>Title</h1>'}),
			finding({code: 'PERSIST_2',
				selector: 'nav > a.logo',
				context: '<a>Home</a>'}),
			finding({code: 'MOVED',
				selector: 'div.old > p',
				context: '<p>Moved element</p>'}),
			finding({code: 'SELECTORGONE',
				selector: 'span.badge',
				context: '<span>99</span>'}),
			finding({code: 'RESOLVED_1',
				selector: 'img.hero',
				context: '<img>'}),
			finding({code: 'RESOLVED_2',
				selector: 'button.submit',
				context: '<button>Go</button>'})
		];
		const later = [
			finding({code: 'PERSIST_1',
				selector: '#main > h1',
				context: '<h1>Title</h1>'}),
			finding({code: 'PERSIST_2',
				selector: 'nav > a.logo',
				context: '<a>Home</a>'}),
			// MOVED: same code + context but a different selector (context-fallback).
			finding({code: 'MOVED',
				selector: 'div.new > p',
				context: '<p>Moved element</p>'}),
			// SELECTORGONE: selector became null but context is unchanged (step 3).
			finding({code: 'SELECTORGONE',
				selector: null,
				context: '<span>99</span>'}),
			finding({code: 'NEW_1',
				selector: 'form#login',
				context: '<form>'}),
			finding({code: 'NEW_2',
				selector: 'a.skip',
				context: '<a>Skip</a>'})
		];

		it('classifies every finding into exactly one bucket (total coverage)', () => {
			const result = compare(earlier, later);
			assert.strictEqual(
				result.persistent.length + result.likelyResolved.length,
				earlier.length
			);
			assert.strictEqual(
				result.persistent.length + result.newFindings.length,
				later.length
			);
		});

		it('reports the four persistent findings (two exact, one moved, one selector-gone)', () => {
			const result = compare(earlier, later);
			assert.lengthEquals(result.persistent, 4);
			const codes = result.persistent.map(item => item.code).sort();
			assert.deepEqual(codes, ['MOVED', 'PERSIST_1', 'PERSIST_2', 'SELECTORGONE']);
		});

		it('labels the two unchanged findings as exact matches', () => {
			const result = compare(earlier, later);
			const persist1 = byCode(result.persistent, 'PERSIST_1')[0];
			const persist2 = byCode(result.persistent, 'PERSIST_2')[0];
			assert.strictEqual(persist1.matchLabel, 'exact');
			assert.strictEqual(persist2.matchLabel, 'exact');
		});

		it('labels the moved finding as a context-fallback match', () => {
			const result = compare(earlier, later);
			const moved = byCode(result.persistent, 'MOVED')[0];
			assert.strictEqual(moved.matchLabel, 'context-fallback');
		});

		it('labels the selector-gone finding as a code-and-context match', () => {
			const result = compare(earlier, later);
			const gone = byCode(result.persistent, 'SELECTORGONE')[0];
			assert.strictEqual(gone.matchLabel, 'code-and-context');
		});

		it('reports the two resolved findings as likelyResolved', () => {
			const result = compare(earlier, later);
			assert.lengthEquals(result.likelyResolved, 2);
			const codes = result.likelyResolved.map(item => item.code).sort();
			assert.deepEqual(codes, ['RESOLVED_1', 'RESOLVED_2']);
			result.likelyResolved.forEach(item => {
				assert.strictEqual(item.matchLabel, 'unmatched');
			});
		});

		it('reports the two new findings as newFindings', () => {
			const result = compare(earlier, later);
			assert.lengthEquals(result.newFindings, 2);
			const codes = result.newFindings.map(item => item.code).sort();
			assert.deepEqual(codes, ['NEW_1', 'NEW_2']);
		});

		it('is order-independent for the persistent classification', () => {
			const shuffledLater = [later[3], later[0], later[5], later[2], later[1], later[4]];
			const result = compare(earlier, shuffledLater);
			assert.lengthEquals(result.persistent, 4);
			assert.lengthEquals(result.likelyResolved, 2);
			assert.lengthEquals(result.newFindings, 2);
		});
	});
});
