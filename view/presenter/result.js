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

const groupBy = require('lodash.groupby');
const keys = require('lodash.keys');
const presentIgnoreRules = require('./ignore');
const techs = require('../../data/techniques')();
const {prioritise} = require('../../lib/prioritise');
const overridesStore = require('../../lib/overrides');
const getRemediationGuidance = require('../../data/remediation-guidance');

module.exports = presentResult;

function htmlEscape(str) {
	return String(str)
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#x27;');
}

function lookupRemediation(ruleCode, table) {
	if (typeof ruleCode !== 'string' || ruleCode.length === 0) {
		return null;
	}
	const segments = ruleCode.split('.');
	if (segments.length < 5) {
		return null;
	}
	const techniqueString = segments.slice(4).join('.');
	const tokens = techniqueString.split(',').map(part => part.trim());
	for (const token of tokens) {
		const baseId = token.split('.')[0].trim();
		if (table[baseId]) {
			return table[baseId];
		}
	}
	return null;
}

function buildOverridesMapForTask(taskId) {
	const all = overridesStore.readAll();
	const map = {};
	Object.keys(all).forEach(key => {
		const entry = all[key];
		if (entry.taskId === taskId) {
			map[entry.ruleCode] = entry;
		}
	});
	return map;
}

function presentResult(result) {

	// Add additional info
	result.href = `/${result.task}/${result.id}`;
	result.hrefCsv = `/${result.task}/${result.id}.csv`;
	result.hrefJson = `/${result.task}/${result.id}.json`;

	// Parse date
	result.date = new Date(result.date);

	// Enhance the ignored rules
	result.ignore = presentIgnoreRules(result.ignore);

	// Split out message types
	if (result.results) {
		const groupedByType = groupBy(result.results, 'type');
		['error', 'warning', 'notice'].forEach(type => {
			const pluralType = `${type}s`;
			const results = groupedByType[type] || [];
			const groupedByCode = groupBy(results, 'code');
			result[pluralType] = keys(groupedByCode).map(group => {
				const groupMessage = groupedByCode[group][0];
				groupMessage.count = groupedByCode[group].length;
				groupMessage.items = groupedByCode[group].map(plural => ({
					selector: plural.selector,
					context: plural.context
				}));
				// Map standard to techniques
				const data = groupMessage.code.split('.');
				data.splice(0, 4);
				const techniques = data.join('.').split(',').map(code => code.split('.')[0]);
				groupMessage.solutions = techniques.reduce((prev, technique) => {
					if (techs[technique] && techs[technique].title) {
						prev.push({
							title: techs[technique].title || null,
							url: techs[technique].url || null
						});
					}
					return prev;
				}, []);
				return groupMessage;
			})
				.sort((currentItem, nextItem) => {
					return nextItem.count - currentItem.count;
				});
		});

		const overridesMap = buildOverridesMapForTask(result.task);
		const remediationTable = getRemediationGuidance();
		['errors', 'warnings', 'notices'].forEach(key => {
			if (result[key]) {
				result[key] = prioritise(result[key], overridesMap);
				result[key].forEach(rule => {
					const guidance = lookupRemediation(rule.code, remediationTable);
					if (guidance) {
						rule.remediation = Object.assign({}, guidance, {
						// Split the newline-joined steps so the template can render
						// each numbered step on its own line.
							stepLines: typeof guidance.steps === 'string' ?
								guidance.steps.split('\n').map(line =>
									line.replace(/^\s*\d+\.\s*/, '').trim()) : [],
							exampleEscaped: guidance.example ? htmlEscape(guidance.example) : null
						});
					} else {
						rule.remediation = null;
					}
				});
			}
		});
	}

	return result;
}
