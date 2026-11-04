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

const overridesStore = require('../../lib/overrides');

const VALID_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

function isValidOverride(rule, level, reason) {
	return Boolean(rule) &&
		VALID_LEVELS.indexOf(level) !== -1 &&
		Boolean(reason) &&
		Boolean(reason.trim());
}

module.exports = function override(app) {
	app.express.post('/:id/override', (request, response) => {
		const taskId = request.params.id;
		const {rule, level, reason} = request.body;

		if (!isValidOverride(rule, level, reason)) {
			return response.redirect(
				`/${taskId}?override-error=1&rule=${encodeURIComponent(rule || '')}`
			);
		}

		try {
			overridesStore.set(taskId, rule, level, reason);
		} catch {
			return response.redirect(
				`/${taskId}?override-error=1&rule=${encodeURIComponent(rule)}`
			);
		}
		response.redirect(`/${taskId}?rule-overridden=1`);
	});

	app.express.post('/:id/override/remove', (request, response) => {
		const taskId = request.params.id;
		const {rule} = request.body;
		if (rule) {
			overridesStore.remove(taskId, rule);
		}
		response.redirect(`/${taskId}?override-removed=1`);
	});
};
