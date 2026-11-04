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

const OVERRIDES_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'overrides.json');

function cleanupOverrides() {
	try {
		fs.unlinkSync(OVERRIDES_PATH);
	} catch (error) {
		if (error.code !== 'ENOENT') {
			throw error;
		}
	}
}

describe('POST /<task-id>/override', function() {

	afterEach(cleanupOverrides);

	describe('with a valid override', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'POST',
				endpoint: '/abc000000000000000000001/override',
				form: {
					rule: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					level: 'Critical',
					reason: 'Confirmed blocker by manual audit'
				}
			}, done);
		});

		it('should redirect to the task page with a success flag', function() {
			assert.match(this.last.request.uri.search, /rule-overridden/);
		});

		it('should send a 200 status after redirect', function() {
			assert.strictEqual(this.last.status, 200);
		});
	});

	describe('with an empty reason', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'POST',
				endpoint: '/abc000000000000000000001/override',
				form: {
					rule: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					level: 'Critical',
					reason: ''
				}
			}, done);
		});

		it('should redirect with an override-error flag', function() {
			assert.match(this.last.request.uri.search, /override-error/);
		});
	});

	describe('with an invalid level', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'POST',
				endpoint: '/abc000000000000000000001/override',
				form: {
					rule: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					level: 'Urgent',
					reason: 'Some reason'
				}
			}, done);
		});

		it('should redirect with an override-error flag', function() {
			assert.match(this.last.request.uri.search, /override-error/);
		});
	});

});

describe('POST /<task-id>/override/remove', function() {

	afterEach(cleanupOverrides);

	describe('removing an existing override', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'POST',
				endpoint: '/abc000000000000000000001/override',
				form: {
					rule: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37',
					level: 'High',
					reason: 'Initial override'
				}
			}, () => {
				this.navigate({
					method: 'POST',
					endpoint: '/abc000000000000000000001/override/remove',
					form: {
						rule: 'WCAG2AA.Principle1.Guideline1_1.1_1_1.H37'
					}
				}, done);
			});
		});

		it('should redirect with an override-removed flag', function() {
			assert.match(this.last.request.uri.search, /override-removed/);
		});

		it('should send a 200 status after redirect', function() {
			assert.strictEqual(this.last.status, 200);
		});
	});

});
