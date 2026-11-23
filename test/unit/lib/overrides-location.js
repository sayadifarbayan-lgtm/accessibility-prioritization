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
const fs = require('fs');
const os = require('os');
const path = require('path');

const overrides = require('../../../lib/overrides');

// Verifies that OVERRIDES_FILE moves the store (used for a mounted volume in a
// container deployment) and that the default location is untouched when unset.
describe('lib/overrides (OVERRIDES_FILE location)', () => {
	let directory;
	let originalValue;

	beforeEach(() => {
		originalValue = process.env.OVERRIDES_FILE;
		directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pa11y-overrides-'));
	});

	afterEach(() => {
		if (typeof originalValue === 'undefined') {
			delete process.env.OVERRIDES_FILE;
		} else {
			process.env.OVERRIDES_FILE = originalValue;
		}
		fs.rmSync(directory, {recursive: true,
			force: true});
	});

	it('stores overrides at the configured path, creating missing directories', () => {
		const target = path.join(directory, 'nested', 'overrides.json');
		process.env.OVERRIDES_FILE = target;

		overrides.set('task-1', 'RULE', 'Critical', 'Needs urgent attention');

		assert.isTrue(fs.existsSync(target));
		assert.isFalse(fs.existsSync(`${target}.tmp`));
		assert.strictEqual(overrides.get('task-1', 'RULE').level, 'Critical');
	});

	it('reads back from the configured path and supports removal', () => {
		process.env.OVERRIDES_FILE = path.join(directory, 'overrides.json');
		overrides.set('task-1', 'RULE', 'High', 'Because');
		overrides.remove('task-1', 'RULE');
		assert.isNull(overrides.get('task-1', 'RULE'));
	});

	it('returns an empty store when the configured file does not exist', () => {
		process.env.OVERRIDES_FILE = path.join(directory, 'missing.json');
		assert.deepEqual(overrides.readAll(), {});
	});
});
