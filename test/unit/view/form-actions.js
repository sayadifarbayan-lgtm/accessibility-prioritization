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
const hbs = require('express-hbs');
const path = require('path');

// Regression tests for the rendered form "action" attributes in the priority
// override form and the compare-scans control. These guard against the bug where
// a nested Handlebars partial could not resolve the task id (rendering an action
// like "//override" instead of "/<task-id>/override").

const VIEWS = path.join(__dirname, '..', '..', '..', 'view');
const TASK_ID = 'abc000000000000000000001';

let engine;

function render(partialFile, data) {
	return new Promise((resolve, reject) => {
		const locals = Object.assign({settings: {views: VIEWS}}, data);
		engine(path.join(VIEWS, 'partial', partialFile), locals, (error, html) => {
			if (error) {
				return reject(error);
			}
			return resolve(html);
		});
	});
}

function actionsOf(html) {
	const actions = [];
	const regex = /action="([^"]*)"/g;
	let match = regex.exec(html);
	while (match) {
		actions.push(match[1]);
		match = regex.exec(html);
	}
	return actions;
}

describe('rendered form actions (task id resolution)', function() {

	before(function() {
		engine = hbs.express4({
			partialsDir: path.join(VIEWS, 'partial'),
			layoutsDir: path.join(VIEWS, 'layout'),
			extname: '.html',
			contentHelperName: 'content'
		});
		require('../../../view/helper/date')(hbs);
		require('../../../view/helper/string')(hbs);
		require('../../../view/helper/url')(hbs);
		require('../../../view/helper/conditionals')(hbs);
	});

	describe('priority-override-form (set)', function() {
		it('renders the set-override action with the task id', async function() {
			const html = await render('priority-override-form.html', {
				rule: {code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					isOverride: false,
					type: 'error'},
				task: {id: TASK_ID},
				readonly: false,
				overrideErrorRule: null
			});
			const actions = actionsOf(html);
			assert.include(actions, `/${TASK_ID}/override`);
			actions.forEach(action => {
				assert.notMatch(action, /^\/\/|\/\/override/,
					`action must not be a malformed "//override" path: ${action}`);
				assert.include(action, TASK_ID);
			});
		});
	});

	describe('priority-override-form (remove)', function() {
		it('renders the remove-override action with the task id', async function() {
			const html = await render('priority-override-form.html', {
				rule: {code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					isOverride: true,
					priorityLevel: 'Critical',
					overrideReason: 'Manual escalation',
					type: 'error'},
				task: {id: TASK_ID},
				readonly: false
			});
			const actions = actionsOf(html);
			assert.include(actions, `/${TASK_ID}/override/remove`);
			actions.forEach(action => {
				assert.include(action, TASK_ID);
			});
		});
	});

	describe('priority-override-form (readonly)', function() {
		it('suppresses the override forms entirely in readonly mode', async function() {
			const html = await render('priority-override-form.html', {
				rule: {code: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					isOverride: false,
					type: 'error'},
				task: {id: TASK_ID},
				readonly: true
			});
			assert.notInclude(html, 'override-set-form');
			assert.notInclude(html, 'override-remove-form');
		});
	});

	describe('task-compare-control', function() {
		it('renders the compare action with the task id from the root context', async function() {
			const html = await render('task-compare-control.html', {
				task: {id: TASK_ID},
				hasMultipleResults: true,
				allResults: [
					{id: 'def000000000000000000001',
						date: new Date()},
					{id: 'def000000000000000000003',
						date: new Date()}
				]
			});
			const actions = actionsOf(html);
			assert.include(actions, `/${TASK_ID}/compare`);
			actions.forEach(action => {
				assert.notMatch(action, /^\/\/compare|^\/compare$/,
					`compare action must include the task id: ${action}`);
				assert.include(action, TASK_ID);
			});
		});
	});

});
