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
const getHeuristicImpact = require('../../../data/heuristic-impact');

describe('data/heuristic-impact', function() {

	const validCategories = [
		'Screen-Reader Blocking',
		'Keyboard Navigation',
		'Colour Contrast',
		'General',
		'Informational'
	];

	const categoryToRank = {
		'Screen-Reader Blocking': 1,
		'Keyboard Navigation': 2,
		'Colour Contrast': 3,
		General: 4,
		Informational: 5
	};

	it('returns an object', function() {
		const table = getHeuristicImpact();
		assert.isObject(table);
	});

	it('returns a frozen object', function() {
		const table = getHeuristicImpact();
		assert.isTrue(Object.isFrozen(table));
	});

	it('does not allow new properties to be added to the returned object', function() {
		const table = getHeuristicImpact();
		try {
			table.NEWKEY = {category: 'General',
				rank: 4};
		} catch (error) {
			// Adding to a frozen object throws in strict mode; that's fine.
		}
		assert.isUndefined(table.NEWKEY);
	});

	it('maps a representative sample spanning all five categories to the correct category and rank', function() {
		const table = getHeuristicImpact();
		const expected = {
			ARIA: {category: 'Screen-Reader Blocking',
				rank: 1},
			H37: {category: 'Screen-Reader Blocking',
				rank: 1},
			H44: {category: 'Keyboard Navigation',
				rank: 2},
			H91: {category: 'Keyboard Navigation',
				rank: 2},
			G18: {category: 'Colour Contrast',
				rank: 3},
			H42: {category: 'General',
				rank: 4},
			G5: {category: 'Informational',
				rank: 5}
		};
		Object.keys(expected).forEach(function(key) {
			assert.deepEqual(table[key], expected[key], `expected ${key} to map correctly`);
		});
	});

	it('only contains entries with a valid category and a rank in {1,2,3,4,5}', function() {
		const table = getHeuristicImpact();
		Object.keys(table).forEach(function(key) {
			const entry = table[key];
			assert.include(validCategories, entry.category, `entry ${key} has an invalid category: ${entry.category}`);
			assert.include([1, 2, 3, 4, 5], entry.rank, `entry ${key} has an invalid rank: ${entry.rank}`);
		});
	});

	it('keeps category and rank consistent for every entry', function() {
		const table = getHeuristicImpact();
		Object.keys(table).forEach(function(key) {
			const entry = table[key];
			assert.strictEqual(
				entry.rank,
				categoryToRank[entry.category],
				`entry ${key} (${entry.category}) should have rank ${categoryToRank[entry.category]} but had ${entry.rank}`
			);
		});
	});

	it('returns undefined for an unknown key', function() {
		const table = getHeuristicImpact();
		assert.isUndefined(table.ZZZ999);
	});

});
