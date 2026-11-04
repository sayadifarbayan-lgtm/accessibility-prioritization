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

const {prioritise} = require('../../lib/prioritise');

/**
 * Annotate an array of ClassifiedFinding objects with priority data.
 * Groups by code to satisfy prioritise()'s input contract, then re-expands.
 */
function annotateFindingArray(findings, overridesMap) {
	const grouped = {};
	findings.forEach(finding => {
		if (!grouped[finding.code]) {
			grouped[finding.code] = {
				code: finding.code,
				type: finding.type,
				message: finding.message,
				count: 0,
				items: [],
				solutions: []
			};
		}
		grouped[finding.code].count += 1;
		grouped[finding.code].items.push({
			selector: finding.selector,
			context: finding.context
		});
	});
	const annotated = prioritise(Object.values(grouped), overridesMap);
	const annotatedByCode = {};
	annotated.forEach(group => {
		annotatedByCode[group.code] = group;
	});
	return findings.map(finding => {
		const annotation = annotatedByCode[finding.code] || {};
		return Object.assign({}, annotation, finding, {
			selector: finding.selector,
			context: finding.context,
			matchLabel: finding.matchLabel,
			matchNote: finding.matchNote,
			isPrecise: finding.isPrecise
		});
	});
}

/**
 * Shape the comparison engine output for the compare.html template.
 *
 * @param {object} comparison - { likelyResolved, persistent, newFindings } from lib/compare.js
 * @param {object} task - the task object (presented or raw; must have id and name)
 * @param {object} overridesMap - plain object keyed by ruleCode
 * @returns {object} template data
 */
function presentCompare(comparison, task, overridesMap) {
	const likelyResolved = annotateFindingArray(comparison.likelyResolved, overridesMap);
	const persistent = annotateFindingArray(comparison.persistent, overridesMap);
	const newFindings = annotateFindingArray(comparison.newFindings, overridesMap);
	return {
		task,
		likelyResolved,
		persistent,
		newFindings,
		totalResolved: likelyResolved.length,
		totalPersistent: persistent.length,
		totalNew: newFindings.length
	};
}

module.exports = presentCompare;
