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

const crypto = require('crypto');

const MIN_PASSWORD_LENGTH = 12;

// Hash both values first so timingSafeEqual always compares equal-length buffers
// and the comparison time does not reveal how much of a guess was correct.
function safeEqual(actual, expected) {
	const actualDigest = crypto.createHash('sha256').update(String(actual)).digest();
	const expectedDigest = crypto.createHash('sha256').update(String(expected)).digest();
	return crypto.timingSafeEqual(actualDigest, expectedDigest);
}

// Parse an "Authorization: Basic <base64(user:password)>" header.
function parseBasicHeader(header) {
	if (typeof header !== 'string') {
		return null;
	}
	const match = (/^Basic\s+([A-Za-z0-9+/=]+)$/i).exec(header.trim());
	if (!match) {
		return null;
	}
	const decoded = Buffer.from(match[1], 'base64').toString('utf8');
	const separator = decoded.indexOf(':');
	if (separator === -1) {
		return null;
	}
	return {
		user: decoded.slice(0, separator),
		password: decoded.slice(separator + 1)
	};
}

/**
 * Express middleware that protects every route with HTTP Basic Auth.
 *
 * The health check path is exempt so a platform health probe can reach it. That
 * endpoint only returns {"status":"ok"}.
 *
 * @param {object} options
 * @param {string} options.user
 * @param {string} options.password
 * @param {string[]} [options.exemptPaths]
 * @param {string} [options.realm]
 * @returns {Function} Express middleware
 */
function basicAuth(options) {
	const {user, password} = options || {};
	if (!user || !password) {
		throw new Error('basicAuth requires both a user and a password');
	}
	const exemptPaths = options.exemptPaths || ['/health'];
	const realm = options.realm || 'Pa11y Dashboard';

	return function basicAuthMiddleware(request, response, next) {
		if (exemptPaths.includes(request.path)) {
			return next();
		}
		const credentials = parseBasicHeader(request.headers.authorization);
		const submitted = credentials || {user: '',
			password: ''};
		// Evaluate both comparisons every time so timing does not reveal which one failed.
		const userMatches = safeEqual(submitted.user, user);
		const passwordMatches = safeEqual(submitted.password, password);
		if (credentials && userMatches && passwordMatches) {
			return next();
		}
		response.set('WWW-Authenticate', `Basic realm="${realm}", charset="UTF-8"`);
		response.set('Cache-Control', 'no-store');
		return response.status(401).type('text/plain').send('Authentication required');
	};
}

/**
 * Fail closed for public deployments.
 *
 * When REQUIRE_ACCESS_CONTROL=true (set in the production Dockerfile) the process
 * refuses to start unless either the dashboard is read-only or HTTP Basic Auth is
 * configured with a strong password. This prevents an anonymous, internet-facing
 * instance that can run scans, delete tasks or edit priority overrides.
 *
 * @param {object} config - the dashboard configuration object
 * @param {object} env - process.env (injectable for tests)
 * @throws {Error} when the configuration would expose anonymous write access
 */
function assertSafeForPublicDeployment(config, env) {
	if (env.REQUIRE_ACCESS_CONTROL !== 'true') {
		return;
	}
	if (env.ALLOW_ANONYMOUS_WRITES === 'true') {
		return;
	}
	if (config.basicAuth) {
		if (config.basicAuth.password.length < MIN_PASSWORD_LENGTH) {
			throw new Error(
				`BASIC_AUTH_PASSWORD must be at least ${MIN_PASSWORD_LENGTH} characters long.`
			);
		}
		return;
	}
	if (config.readonly) {
		return;
	}
	throw new Error(
		'Refusing to start: this deployment would allow anonymous users to run scans, ' +
'delete tasks and change priority overrides. Set BASIC_AUTH_USER and ' +
'BASIC_AUTH_PASSWORD, or set READONLY=true. ' +
'(Override with ALLOW_ANONYMOUS_WRITES=true only if you accept that risk.)'
	);
}

/**
 * Hide the password in a MongoDB connection string so it is safe to log.
 *
 * @param {string} uri
 * @returns {string}
 */
function redactConnectionString(uri) {
	if (typeof uri !== 'string') {
		return uri;
	}
	return uri.replace(/(\/\/[^:/@\s]+):[^@\s]*@/, '$1:***@');
}

module.exports = {
	basicAuth,
	assertSafeForPublicDeployment,
	redactConnectionString
};
