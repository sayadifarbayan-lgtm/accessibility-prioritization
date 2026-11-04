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

const getHeuristicImpact = require('../data/heuristic-impact');

const PRIORITY_ORDER = {Critical: 0,
	High: 1,
	Medium: 2,
	Low: 3};

/**
 * Derive the heuristic impact category and rank from a Pa11y rule code.
 * Strategy: take segments[4..end], join with '.', split on ',' for compound codes,
 * then for each token take the part before '.' (drop sub-qualifiers like H30.2, G18.Fail),
 * look up exact match then leading-letters prefix match.
 * Falls back to { category: 'General', rank: 4 }.
 */
// eslint-disable-next-line complexity
function deriveImpact(ruleCode, table) {
	if (typeof ruleCode !== 'string' || ruleCode.length === 0) {
		return {category: 'General',
			rank: 4};
	}
	const segments = ruleCode.split('.');
	if (segments.length < 5) {
		return {category: 'General',
			rank: 4};
	}
	const techniqueString = segments.slice(4).join('.');
	const tokens = techniqueString.split(',').map(part => part.trim());
	for (const token of tokens) {
		const baseId = token.split('.')[0].trim();
		if (table[baseId]) {
			return table[baseId];
		}
		// Leading letters only (strip trailing digits and any sub-qualifier)
		const prefix = baseId.replace(/[0-9]+.*$/, '');
		if (prefix && table[prefix]) {
			return table[prefix];
		}
	}
	return {category: 'General',
		rank: 4};
}

/**
 * Compute the base priority level from Pa11y type and recurrence count.
 * Critical is NEVER returned here — it is reserved for manual overrides.
 */
function computeLevel(type, count) {
	if (type === 'error') {
		return 'High';
	}
	if (type === 'warning') {
		return count >= 5 ? 'High' : 'Medium';
	}
	// Notice and any unrecognised type
	return 'Low';
}

function isNonEmpty(value) {
	return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Annotate an array of grouped rule objects with priority fields.
 *
 * @param {object[]} groupedRules - Array from view/presenter/result.js, each with:
 *   code, type, count, items[], solutions[], message
 * @param {object} overridesMap - Plain object keyed by ruleCode → override entry
 * @returns {object[]} New array of annotated rule objects (input not mutated)
 */
function prioritise(groupedRules, overridesMap) {
	const impactTable = getHeuristicImpact();
	// eslint-disable-next-line complexity
	return groupedRules.map(rule => {
		const impact = deriveImpact(rule.code, impactTable);
		const computedLevel = computeLevel(rule.type, rule.count);
		const override = (overridesMap && overridesMap[rule.code]) || null;
		const finalLevel = override ? override.level : computedLevel;
		const firstItem = (rule.items && rule.items[0]) || {};
		const confidence = (isNonEmpty(firstItem.selector) && isNonEmpty(firstItem.context)) ?
			'high-confidence' :
			'low-confidence';
		return Object.assign({}, rule, {
			priorityLevel: finalLevel,
			priorityOrder: Object.prototype.hasOwnProperty.call(PRIORITY_ORDER, finalLevel) ?
				PRIORITY_ORDER[finalLevel] : 3,
			computedLevel,
			impactCategory: impact.category,
			impactCategoryRank: impact.rank,
			confidence,
			isOverride: Boolean(override),
			overrideReason: override ? override.reason : null
		});
	});
}

module.exports = {prioritise,
	deriveImpact,
	computeLevel};
