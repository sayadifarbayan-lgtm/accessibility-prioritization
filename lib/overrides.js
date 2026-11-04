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

const fs = require('fs');
const path = require('path');

const OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'overrides.json');
const TMP_PATH = `${OVERRIDES_PATH}.tmp`;
const VALID_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

/**
 * Read all overrides from disk.
 * Returns {} if the file does not exist (ENOENT).
 * Throws for any other error (permissions, corrupt JSON, etc).
 */
function readAll() {
	try {
		const raw = fs.readFileSync(OVERRIDES_PATH, 'utf8');
		return JSON.parse(raw);
	} catch (error) {
		if (error.code === 'ENOENT') {
			return {};
		}
		throw error;
	}
}

/**
 * Return the override entry for a specific task+rule, or null if absent.
 */
function get(taskId, ruleCode) {
	const all = readAll();
	return all[`${taskId}:${ruleCode}`] || null;
}

/**
 * Write (create or replace) one override entry atomically.
 * Throws if level is not one of Critical|High|Medium|Low, or reason is empty/blank.
 */
function set(taskId, ruleCode, level, reason) {
	if (!VALID_LEVELS.includes(level)) {
		throw new Error(`Invalid priority level: ${level}`);
	}
	if (!reason || !reason.trim()) {
		throw new Error('Override reason must not be empty');
	}
	const all = readAll();
	all[`${taskId}:${ruleCode}`] = {
		taskId,
		ruleCode,
		level,
		reason: reason.trim(),
		updatedAt: new Date().toISOString()
	};
	const json = JSON.stringify(all, null, 2);
	fs.writeFileSync(TMP_PATH, json, 'utf8');
	fs.renameSync(TMP_PATH, OVERRIDES_PATH);
}

/**
 * Remove one override entry. No-op if the entry does not exist.
 */
function remove(taskId, ruleCode) {
	const all = readAll();
	const key = `${taskId}:${ruleCode}`;
	if (!Object.prototype.hasOwnProperty.call(all, key)) {
		return;
	}
	delete all[key];
	const json = JSON.stringify(all, null, 2);
	fs.writeFileSync(TMP_PATH, json, 'utf8');
	fs.renameSync(TMP_PATH, OVERRIDES_PATH);
}

module.exports = {readAll,
	get,
	set,
	remove};
