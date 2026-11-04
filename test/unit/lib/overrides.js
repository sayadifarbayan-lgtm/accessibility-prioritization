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
const path = require('path');

const overrides = require('../../../lib/overrides');

const OVERRIDES_PATH = path.join(__dirname, '..', '..', '..', 'data', 'overrides.json');
const TMP_PATH = `${OVERRIDES_PATH}.tmp`;

// Remove a single file, ignoring "file not found" so cleanup never fails a
// test. Any other error is surfaced so we notice real filesystem problems.
function removeIfPresent(target) {
	try {
		fs.unlinkSync(target);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}
}

// Remove the live and tmp override files between tests.
function cleanup() {
	removeIfPresent(OVERRIDES_PATH);
	removeIfPresent(TMP_PATH);
}

describe('lib/overrides', function() {

	afterEach(cleanup);

	describe('readAll()', function() {

		it('returns {} when the overrides file does not exist', function() {
			cleanup();
			assert.deepStrictEqual(overrides.readAll(), {});
		});

		it('returns the parsed object when the file exists with valid JSON', function() {
			const data = {
				'task-1:H37': {
					taskId: 'task-1',
					ruleCode: 'H37',
					level: 'High',
					reason: 'Alt text missing',
					updatedAt: '2024-01-01T00:00:00.000Z'
				}
			};
			fs.writeFileSync(OVERRIDES_PATH, JSON.stringify(data), 'utf8');
			assert.deepStrictEqual(overrides.readAll(), data);
		});

		it('throws when the file exists but contains corrupt JSON', function() {
			fs.writeFileSync(OVERRIDES_PATH, '{ this is not valid json', 'utf8');
			assert.throws(function() {
				overrides.readAll();
			});
		});

	});

	describe('get()', function() {

		it('returns the matching entry', function() {
			overrides.set('task-1', 'H37', 'High', 'Alt text missing');
			const entry = overrides.get('task-1', 'H37');
			assert.isObject(entry);
			assert.strictEqual(entry.taskId, 'task-1');
			assert.strictEqual(entry.ruleCode, 'H37');
			assert.strictEqual(entry.level, 'High');
			assert.strictEqual(entry.reason, 'Alt text missing');
		});

		it('returns null when there is no matching entry', function() {
			overrides.set('task-1', 'H37', 'High', 'Alt text missing');
			assert.isNull(overrides.get('task-1', 'DOES-NOT-EXIST'));
		});

		it('returns null when the overrides file does not exist', function() {
			cleanup();
			assert.isNull(overrides.get('task-1', 'H37'));
		});

	});

	describe('set()', function() {

		it('writes an entry that a subsequent get() can read back', function() {
			overrides.set('task-9', 'G18', 'Critical', 'Blocks screen readers');
			const entry = overrides.get('task-9', 'G18');
			assert.isObject(entry);
			assert.strictEqual(entry.level, 'Critical');
			assert.strictEqual(entry.reason, 'Blocks screen readers');
			assert.isString(entry.updatedAt);
		});

		it('trims surrounding whitespace from the reason', function() {
			overrides.set('task-9', 'G18', 'Low', '   padded reason   ');
			assert.strictEqual(overrides.get('task-9', 'G18').reason, 'padded reason');
		});

		it('throws when the level is invalid', function() {
			assert.throws(function() {
				overrides.set('task-1', 'H37', 'Urgent', 'A reason');
			}, /invalid priority level/i);
		});

		it('throws when the reason is an empty string', function() {
			assert.throws(function() {
				overrides.set('task-1', 'H37', 'High', '');
			}, /reason must not be empty/i);
		});

		it('throws when the reason is only whitespace', function() {
			assert.throws(function() {
				overrides.set('task-1', 'H37', 'High', '   ');
			}, /reason must not be empty/i);
		});

		it('leaves no .tmp file behind after a successful write', function() {
			overrides.set('task-1', 'H37', 'High', 'Alt text missing');
			assert.isFalse(fs.existsSync(TMP_PATH));
			assert.isTrue(fs.existsSync(OVERRIDES_PATH));
		});

	});

	describe('remove()', function() {

		it('removes an existing entry so get() then returns null', function() {
			overrides.set('task-1', 'H37', 'High', 'Alt text missing');
			assert.isObject(overrides.get('task-1', 'H37'));
			overrides.remove('task-1', 'H37');
			assert.isNull(overrides.get('task-1', 'H37'));
		});

		it('does not throw when the entry is absent (no-op)', function() {
			overrides.set('task-1', 'H37', 'High', 'Alt text missing');
			assert.doesNotThrow(function() {
				overrides.remove('task-1', 'NOT-PRESENT');
			});
			// The existing entry is untouched.
			assert.isObject(overrides.get('task-1', 'H37'));
		});

		it('does not throw when the overrides file does not exist', function() {
			cleanup();
			assert.doesNotThrow(function() {
				overrides.remove('task-1', 'H37');
			});
		});

	});

});
