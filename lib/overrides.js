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

const DEFAULT_OVERRIDES_PATH = path.join(__dirname, '..', 'data', 'overrides.json');

// The override store location can be moved (for example onto a mounted volume in a
// container deployment) by setting OVERRIDES_FILE. It is read on every call so the
// default behaviour is unchanged when the variable is not set.
function overridesPath() {
	return process.env.OVERRIDES_FILE || DEFAULT_OVERRIDES_PATH;
}
const VALID_LEVELS = ['Critical', 'High', 'Medium', 'Low'];

// Write the whole store to a temporary file next to the target, then rename it over
// the target so a crash can never leave a half-written file behind.
function writeAtomically(all) {
	const target = overridesPath();
	const temporary = `${target}.tmp`;
	fs.mkdirSync(path.dirname(target), {recursive: true});
	fs.writeFileSync(temporary, JSON.stringify(all, null, 2), 'utf8');
	fs.renameSync(temporary, target);
}

/**
 * Read all overrides from disk.
 * Returns {} if the file does not exist (ENOENT).
 * Throws for any other error (permissions, corrupt JSON, etc).
 */
function readAll() {
	try {
		const raw = fs.readFileSync(overridesPath(), 'utf8');
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
	writeAtomically(all);
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
	writeAtomically(all);
}

module.exports = {readAll,
	get,
	set,
	remove};
