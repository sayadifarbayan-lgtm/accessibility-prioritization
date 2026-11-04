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
const {prioritise, deriveImpact, computeLevel} = require('../../../lib/prioritise');
const getHeuristicImpact = require('../../../data/heuristic-impact');

// --- Helpers ---------------------------------------------------------------

// Build a single grouped-rule object with sensible defaults, overridable per test.
function buildRule(overrides) {
	return Object.assign({
		code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
		type: 'error',
		count: 1,
		message: 'A sample message',
		solutions: [],
		items: [{selector: 'html > body > p',
			context: '<p>hi</p>'}]
	}, overrides || {});
}

// A representative mixed-input array exercising all three Pa11y types.
function buildMixedRules() {
	return [
		buildRule({
			code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
			type: 'error',
			count: 3
		}),
		buildRule({
			code: 'WCAG2AA.Principle2.Guideline2_4.2_4_1.H64',
			type: 'warning',
			count: 2
		}),
		buildRule({
			code: 'WCAG2AA.Principle2.Guideline2_4.2_4_1.H64',
			type: 'warning',
			count: 7
		}),
		buildRule({
			code: 'WCAG2AA.Principle1.Guideline1_4.1_4_3.G18',
			type: 'notice',
			count: 10
		})
	];
}

const VALID_RANKS = [1, 2, 3, 4, 5];

// --- Tests -----------------------------------------------------------------

describe('lib/prioritise', function() {

	describe('prioritise()', function() {

		describe('P1: Totality', function() {
			it('returns an array of the same length as the input', function() {
				const input = buildMixedRules();
				const output = prioritise(input, {});
				assert.isArray(output);
				assert.strictEqual(output.length, input.length);
			});

			it('returns no null or undefined entries', function() {
				const output = prioritise(buildMixedRules(), {});
				output.forEach(function(entry) {
					assert.isNotNull(entry);
					assert.isDefined(entry);
				});
			});

			it('does not mutate the input array', function() {
				const input = buildMixedRules();
				const snapshot = JSON.stringify(input);
				prioritise(input, {});
				assert.strictEqual(JSON.stringify(input), snapshot);
			});

			it('handles an empty input array', function() {
				const output = prioritise([], {});
				assert.isArray(output);
				assert.strictEqual(output.length, 0);
			});
		});

		describe('P2: Type mapping (computedLevel)', function() {
			it('maps every error rule to High', function() {
				const output = prioritise([
					buildRule({type: 'error',
						count: 1}),
					buildRule({type: 'error',
						count: 99})
				], {});
				output.forEach(function(entry) {
					assert.strictEqual(entry.computedLevel, 'High');
				});
			});

			it('maps every notice rule to Low', function() {
				const output = prioritise([
					buildRule({type: 'notice',
						count: 1}),
					buildRule({type: 'notice',
						count: 50})
				], {});
				output.forEach(function(entry) {
					assert.strictEqual(entry.computedLevel, 'Low');
				});
			});

			it('maps warning rules with count >= 5 to High', function() {
				const output = prioritise([
					buildRule({type: 'warning',
						count: 5}),
					buildRule({type: 'warning',
						count: 20})
				], {});
				output.forEach(function(entry) {
					assert.strictEqual(entry.computedLevel, 'High');
				});
			});

			it('maps warning rules with count < 5 to Medium', function() {
				const output = prioritise([
					buildRule({type: 'warning',
						count: 1}),
					buildRule({type: 'warning',
						count: 4})
				], {});
				output.forEach(function(entry) {
					assert.strictEqual(entry.computedLevel, 'Medium');
				});
			});
		});

		describe('P3: No automatic Critical', function() {
			it('never produces priorityLevel Critical without overrides', function() {
				const output = prioritise(buildMixedRules(), {});
				output.forEach(function(entry) {
					assert.notStrictEqual(entry.priorityLevel, 'Critical');
				});
			});

			it('never produces priorityLevel Critical when overridesMap is null', function() {
				const output = prioritise(buildMixedRules(), null);
				output.forEach(function(entry) {
					assert.notStrictEqual(entry.priorityLevel, 'Critical');
				});
			});
		});

		describe('P4: Override supremacy', function() {
			it('uses the override level over the computed level', function() {
				const rule = buildRule({
					code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					type: 'notice',
					count: 1
				});
				const overridesMap = {
					'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37': {
						level: 'Critical',
						reason: 'Blocks checkout flow'
					}
				};
				const output = prioritise([rule], overridesMap);
				assert.strictEqual(output[0].priorityLevel, 'Critical');
				assert.isTrue(output[0].isOverride);
				assert.strictEqual(output[0].overrideReason, 'Blocks checkout flow');
			});

			it('still records the computed level alongside the override', function() {
				const rule = buildRule({type: 'notice',
					count: 1});
				const overridesMap = {
					'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37': {
						level: 'High',
						reason: 'Manual escalation'
					}
				};
				const output = prioritise([rule], overridesMap);
				assert.strictEqual(output[0].priorityLevel, 'High');
				assert.strictEqual(output[0].computedLevel, 'Low');
			});

			it('leaves non-overridden rules unflagged', function() {
				const overridesMap = {
					'SOME.OTHER.CODE': {level: 'Critical',
						reason: 'n/a'}
				};
				const output = prioritise([buildRule()], overridesMap);
				assert.isFalse(output[0].isOverride);
				assert.isNull(output[0].overrideReason);
			});
		});

		describe('P5: Confidence correctness', function() {
			it('is high-confidence when selector and context are both set', function() {
				const output = prioritise([
					buildRule({items: [{selector: 'div > a',
						context: '<a>x</a>'}]})
				], {});
				assert.strictEqual(output[0].confidence, 'high-confidence');
			});

			it('is low-confidence when selector is empty', function() {
				const output = prioritise([
					buildRule({items: [{selector: '',
						context: '<a>x</a>'}]})
				], {});
				assert.strictEqual(output[0].confidence, 'low-confidence');
			});

			it('is low-confidence when context is empty', function() {
				const output = prioritise([
					buildRule({items: [{selector: 'div > a',
						context: ''}]})
				], {});
				assert.strictEqual(output[0].confidence, 'low-confidence');
			});

			it('is low-confidence when the items array is empty', function() {
				const output = prioritise([
					buildRule({items: []})
				], {});
				assert.strictEqual(output[0].confidence, 'low-confidence');
			});
		});

		describe('P6: Impact Category Rank range', function() {
			it('always produces an impactCategoryRank within {1,2,3,4,5}', function() {
				const output = prioritise(buildMixedRules(), {});
				output.forEach(function(entry) {
					assert.include(VALID_RANKS, entry.impactCategoryRank);
				});
			});

			it('falls back to rank 4 for an unrecognised rule code', function() {
				const output = prioritise([
					buildRule({code: 'WCAG2AA.Principle9.Guideline9_9.9_9_9.ZZZ999'})
				], {});
				assert.strictEqual(output[0].impactCategoryRank, 4);
				assert.strictEqual(output[0].impactCategory, 'General');
			});
		});

		describe('P7: Determinism', function() {
			it('produces identical output for the same input', function() {
				const input = buildMixedRules();
				const first = prioritise(input, {});
				const second = prioritise(input, {});
				assert.deepEqual(first, second);
			});
		});

		describe('Boundary conditions (warning count)', function() {
			it('count = 4 maps to Medium', function() {
				const output = prioritise([
					buildRule({type: 'warning',
						count: 4})
				], {});
				assert.strictEqual(output[0].computedLevel, 'Medium');
			});

			it('count = 5 maps to High', function() {
				const output = prioritise([
					buildRule({type: 'warning',
						count: 5})
				], {});
				assert.strictEqual(output[0].computedLevel, 'High');
			});

			it('count = 6 maps to High', function() {
				const output = prioritise([
					buildRule({type: 'warning',
						count: 6})
				], {});
				assert.strictEqual(output[0].computedLevel, 'High');
			});
		});

		describe('Null safety', function() {
			it('does not throw and is low-confidence for null selector and context', function() {
				let output;
				assert.doesNotThrow(function() {
					output = prioritise([
						buildRule({items: [{selector: null,
							context: null}]})
					], {});
				});
				assert.strictEqual(output[0].confidence, 'low-confidence');
			});
		});

		describe('priorityOrder field', function() {
			it('maps Critical override to order 0', function() {
				const output = prioritise([buildRule()], {
					'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37': {
						level: 'Critical',
						reason: 'x'
					}
				});
				assert.strictEqual(output[0].priorityOrder, 0);
			});

			it('maps High to order 1', function() {
				const output = prioritise([buildRule({type: 'error'})], {});
				assert.strictEqual(output[0].priorityOrder, 1);
			});

			it('maps Medium to order 2', function() {
				const output = prioritise([buildRule({type: 'warning',
					count: 2})], {});
				assert.strictEqual(output[0].priorityOrder, 2);
			});

			it('maps Low to order 3', function() {
				const output = prioritise([buildRule({type: 'notice'})], {});
				assert.strictEqual(output[0].priorityOrder, 3);
			});
		});
	});

	describe('computeLevel()', function() {
		it('returns High for error regardless of count', function() {
			assert.strictEqual(computeLevel('error', 0), 'High');
			assert.strictEqual(computeLevel('error', 100), 'High');
		});

		it('returns Low for notice', function() {
			assert.strictEqual(computeLevel('notice', 1), 'Low');
		});

		it('returns Low for an unrecognised type', function() {
			assert.strictEqual(computeLevel('mystery', 10), 'Low');
		});

		it('returns High for warning with count >= 5', function() {
			assert.strictEqual(computeLevel('warning', 5), 'High');
			assert.strictEqual(computeLevel('warning', 6), 'High');
		});

		it('returns Medium for warning with count < 5', function() {
			assert.strictEqual(computeLevel('warning', 4), 'Medium');
			assert.strictEqual(computeLevel('warning', 1), 'Medium');
		});
	});

	describe('deriveImpact()', function() {
		let table;

		beforeEach(function() {
			table = getHeuristicImpact();
		});

		it('maps H37 to Screen-Reader Blocking rank 1', function() {
			const impact = deriveImpact('WCAG2AA.Principle1.Guideline1_1.1_1_1.H37', table);
			assert.strictEqual(impact.category, 'Screen-Reader Blocking');
			assert.strictEqual(impact.rank, 1);
		});

		it('maps H64 to Keyboard Navigation rank 2', function() {
			const impact = deriveImpact('WCAG2AA.Principle2.Guideline2_4.2_4_1.H64', table);
			assert.strictEqual(impact.category, 'Keyboard Navigation');
			assert.strictEqual(impact.rank, 2);
		});

		it('maps G18 to Colour Contrast rank 3', function() {
			const impact = deriveImpact('WCAG2AA.Principle1.Guideline1_4.1_4_3.G18', table);
			assert.strictEqual(impact.category, 'Colour Contrast');
			assert.strictEqual(impact.rank, 3);
		});

		it('drops a variant suffix (H30.2) and matches the base technique', function() {
			const impact = deriveImpact('WCAG2AA.Principle1.Guideline1_1.1_1_1.H30.2', table);
			assert.strictEqual(impact.category, 'Screen-Reader Blocking');
			assert.strictEqual(impact.rank, 1);
		});

		it('resolves a compound code (G73,G74) via a token lookup', function() {
			// Neither G73 nor G74 is in the table, so this falls back to General rank 4.
			const impact = deriveImpact('WCAG2AA.Principle1.Guideline1_1.1_1_1.G73,G74', table);
			assert.strictEqual(impact.category, 'General');
			assert.strictEqual(impact.rank, 4);
		});

		it('resolves a compound code where a token matches (G18,G145)', function() {
			const impact = deriveImpact('WCAG2AA.Principle1.Guideline1_4.1_4_3.G18,G145', table);
			assert.strictEqual(impact.category, 'Colour Contrast');
			assert.strictEqual(impact.rank, 3);
		});

		it('falls back to General rank 4 for a short code with fewer than 5 segments', function() {
			const impact = deriveImpact('WCAG2AA.Principle1.H37', table);
			assert.strictEqual(impact.category, 'General');
			assert.strictEqual(impact.rank, 4);
		});

		it('falls back to General rank 4 for an unknown technique ID', function() {
			const impact = deriveImpact('WCAG2AA.Principle9.Guideline9_9.9_9_9.ZZZ999', table);
			assert.strictEqual(impact.category, 'General');
			assert.strictEqual(impact.rank, 4);
		});
	});
});
