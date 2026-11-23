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
const {
	basicAuth,
	assertSafeForPublicDeployment,
	redactConnectionString
} = require('../../../lib/deployment-safety');

const USER = 'professor';
const PASSWORD = 'a-long-demo-password-1';

function createResponse() {
	const response = {
		headers: {},
		statusCode: null,
		body: null
	};
	response.set = (name, value) => {
		response.headers[name] = value;
		return response;
	};
	response.status = code => {
		response.statusCode = code;
		return response;
	};
	response.type = () => response;
	response.send = body => {
		response.body = body;
		return response;
	};
	return response;
}

function basicHeader(user, password) {
	return `Basic ${Buffer.from(`${user}:${password}`).toString('base64')}`;
}

function run(middleware, headers, requestPath) {
	const response = createResponse();
	let nextCalled = false;
	middleware({
		path: requestPath || '/',
		headers: headers || {}
	}, response, () => {
		nextCalled = true;
	});
	return {
		response,
		nextCalled
	};
}

describe('lib/deployment-safety', () => {

	describe('basicAuth()', () => {
		const middleware = basicAuth({user: USER,
			password: PASSWORD});

		it('throws when user or password is missing', () => {
			assert.throws(() => basicAuth({user: USER}));
			assert.throws(() => basicAuth({password: PASSWORD}));
			assert.throws(() => basicAuth());
		});

		it('rejects a request with no credentials and sends a challenge', () => {
			const {response, nextCalled} = run(middleware);
			assert.isFalse(nextCalled);
			assert.strictEqual(response.statusCode, 401);
			assert.match(response.headers['WWW-Authenticate'], /^Basic realm=/);
		});

		it('rejects a wrong password', () => {
			const header = basicHeader(USER, 'nope');
			const {response, nextCalled} = run(middleware, {authorization: header});
			assert.isFalse(nextCalled);
			assert.strictEqual(response.statusCode, 401);
		});

		it('rejects a wrong user', () => {
			const {nextCalled} = run(middleware, {authorization: basicHeader('someone', PASSWORD)});
			assert.isFalse(nextCalled);
		});

		it('rejects a malformed header', () => {
			assert.isFalse(run(middleware, {authorization: 'Bearer abc'}).nextCalled);
			assert.isFalse(run(middleware, {authorization: 'Basic !!!'}).nextCalled);
			const noSeparator = `Basic ${Buffer.from('nocolon').toString('base64')}`;
			assert.isFalse(run(middleware, {authorization: noSeparator}).nextCalled);
		});

		it('accepts the correct credentials', () => {
			const {nextCalled} = run(middleware, {authorization: basicHeader(USER, PASSWORD)});
			assert.isTrue(nextCalled);
		});

		it('accepts a password that itself contains a colon', () => {
			const colonMiddleware = basicAuth({user: USER,
				password: 'pass:word:123456'});
			const header = basicHeader(USER, 'pass:word:123456');
			assert.isTrue(run(colonMiddleware, {authorization: header}).nextCalled);
		});

		it('lets the health probe through without credentials', () => {
			assert.isTrue(run(middleware, {}, '/health').nextCalled);
		});

		it('does not exempt other paths', () => {
			assert.isFalse(run(middleware, {}, '/health/extra').nextCalled);
			assert.isFalse(run(middleware, {}, '/new').nextCalled);
		});
	});

	describe('assertSafeForPublicDeployment()', () => {
		const required = {REQUIRE_ACCESS_CONTROL: 'true'};

		it('does nothing unless REQUIRE_ACCESS_CONTROL is true (local development)', () => {
			assert.doesNotThrow(() => assertSafeForPublicDeployment({readonly: false}, {}));
		});

		it('refuses to start with anonymous write access', () => {
			assert.throws(
				() => assertSafeForPublicDeployment({readonly: false}, required),
				/Refusing to start/
			);
		});

		it('allows a read-only deployment without a password', () => {
			assert.doesNotThrow(() => assertSafeForPublicDeployment({readonly: true}, required));
		});

		it('allows a deployment protected by a strong Basic Auth password', () => {
			const config = {readonly: false,
				basicAuth: {user: USER,
					password: PASSWORD}};
			assert.doesNotThrow(() => assertSafeForPublicDeployment(config, required));
		});

		it('rejects a short Basic Auth password', () => {
			const config = {readonly: false,
				basicAuth: {user: USER,
					password: 'short'}};
			assert.throws(() => assertSafeForPublicDeployment(config, required), /at least 12/);
		});

		it('honours an explicit ALLOW_ANONYMOUS_WRITES=true opt-out', () => {
			const env = {REQUIRE_ACCESS_CONTROL: 'true',
				ALLOW_ANONYMOUS_WRITES: 'true'};
			assert.doesNotThrow(() => assertSafeForPublicDeployment({readonly: false}, env));
		});
	});

	describe('redactConnectionString()', () => {
		it('hides the password but keeps host, database and options', () => {
			const redacted = redactConnectionString(
				'mongodb://mongo:s3cr3t%21@db.internal:27017/pa11y?authSource=admin'
			);
			assert.strictEqual(redacted, 'mongodb://mongo:***@db.internal:27017/pa11y?authSource=admin');
			assert.notInclude(redacted, 's3cr3t');
		});

		it('leaves a string without credentials unchanged', () => {
			const plain = 'mongodb://127.0.0.1/pa11y';
			assert.strictEqual(redactConnectionString(plain), plain);
		});

		it('passes non-strings through', () => {
			assert.isUndefined(redactConnectionString(undefined));
		});
	});

});
