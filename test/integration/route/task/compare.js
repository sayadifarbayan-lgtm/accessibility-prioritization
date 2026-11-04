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

describe('GET /<task-id>/compare', function() {

	describe('with two valid result IDs', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'GET',
				endpoint: '/abc000000000000000000001/compare',
				query: {
					earlierId: 'def000000000000000000003',
					laterId: 'def000000000000000000001'
				}
			}, done);
		});

		it('should send a 200 status', function() {
			assert.strictEqual(this.last.status, 200);
		});

		it('should display the inferred-results disclaimer', function() {
			assert.match(this.last.dom('.comparison-disclaimer').text(), /inferred from automated scan data/i);
		});

		it('should display the "Likely Resolved" section heading', function() {
			assert.match(this.last.dom('#resolved-heading').text(), /likely resolved/i);
		});

		it('should display the "Persistent" section heading', function() {
			assert.match(this.last.dom('#persistent-heading').text(), /persistent/i);
		});

		it('should display the "New" section heading', function() {
			assert.match(this.last.dom('#new-heading').text(), /new/i);
		});

		it('should display a link back to the task page', function() {
			assert.strictEqual(
				this.last.dom('[href="/abc000000000000000000001"]').length >= 1,
				true
			);
		});
	});

	describe('with missing query parameters', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'GET',
				endpoint: '/abc000000000000000000001/compare'
			}, done);
		});

		it('should send a 404 status', function() {
			assert.strictEqual(this.last.status, 404);
		});
	});

	describe('with a non-existent task', function() {
		beforeEach(function(done) {
			this.navigate({
				method: 'GET',
				endpoint: '/abc000000000000000000999/compare',
				query: {
					earlierId: 'def000000000000000000003',
					laterId: 'def000000000000000000001'
				}
			}, done);
		});

		it('should send a 404 status', function() {
			assert.strictEqual(this.last.status, 404);
		});
	});

});
