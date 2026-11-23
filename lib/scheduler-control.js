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

const path = require('path');

// The replacement scheduler. It intentionally does nothing: no cron job is created.
function disabledScheduler() {
	return undefined;
}

// The embedded Pa11y Webservice always starts a daily scan of every task: when no cron
// expression is configured it falls back to "0 30 0 * * *" (task/pa11y.js), and there is no
// configuration option to turn the scheduler off. For a shared demo deployment that would
// mean unattended nightly scans, and one set per running instance.
//
// disableScheduledScans() swaps that single module for a no-op BEFORE the webservice starts,
// so no cron job is created. Manual runs from the dashboard use a different code path
// (model.task.runById) and are not affected.
//
// Returns a function that restores the original module (used by the tests).
function disableScheduledScans() {
	const webserviceRoot = path.dirname(require.resolve('pa11y-webservice'));
	const schedulerPath = require.resolve(path.join(webserviceRoot, 'task', 'pa11y.js'));

	const original = require(schedulerPath);

	require.cache[schedulerPath].exports = disabledScheduler;
	return function restore() {
		require.cache[schedulerPath].exports = original;
	};
}

module.exports = {disableScheduledScans};
