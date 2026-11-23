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
const path = require('path');
const {disableScheduledScans} = require('../../../lib/scheduler-control');

const schedulerPath = path.join(
	path.dirname(require.resolve('pa11y-webservice')),
	'task',
	'pa11y.js'
);

describe('lib/scheduler-control', () => {
	let restore;

	afterEach(() => {
		if (restore) {
			restore();
			restore = null;
		}
	});

	it('replaces the webservice scheduler with a function that creates no cron job', () => {
		restore = disableScheduledScans();

		const scheduler = require(schedulerPath);
		const config = {cron: false};

		assert.isFunction(scheduler);
		assert.doesNotThrow(() => scheduler(config, {}));
		// The original scheduler would have filled in its daily default here.
		assert.strictEqual(config.cron, false);
	});

	it('can be restored to the original scheduler', () => {

		const original = require(schedulerPath);
		restore = disableScheduledScans();
		restore();
		restore = null;

		assert.strictEqual(require(schedulerPath), original);
	});
});
