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

const moment = require('moment');
const {compare} = require('../../lib/compare');
const presentCompare = require('../../view/presenter/compare');
const presentTask = require('../../view/presenter/task');
const overridesStore = require('../../lib/overrides');

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

module.exports = function compareRoute(app) {
	app.express.get('/:id/compare', (request, response, next) => {
		const taskId = request.params.id;
		const {earlierId, laterId} = request.query;

		if (!earlierId || !laterId) {
			return next();
		}

		app.webservice.task(taskId).get({}, (taskError, task) => {
			if (taskError) {
				return next();
			}
			app.webservice
				.task(taskId)
				.result(earlierId)
				.get({full: true}, (earlierError, earlierResult) => {
					if (earlierError) {
						return next();
					}
					app.webservice
						.task(taskId)
						.result(laterId)
						.get({full: true}, (laterError, laterResult) => {
							if (laterError) {
								return next();
							}
							const comparison = compare(
								earlierResult.results || [],
								laterResult.results || []
							);
							const overridesMap = buildOverridesMapForTask(taskId);
							const presented = presentCompare(
								comparison,
								presentTask(task),
								overridesMap
							);
							presented.earlierDate = moment(earlierResult.date)
								.format('DD MMM YYYY HH:mm');
							presented.laterDate = moment(laterResult.date)
								.format('DD MMM YYYY HH:mm');
							presented.isResultPage = true;
							response.render('compare', presented);
						});
				});
		});
	});
};
