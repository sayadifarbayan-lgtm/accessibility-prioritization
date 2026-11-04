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

// Maps WCAG technique IDs to remediation guidance objects.
// Each entry has:
//   steps:   string — newline-separated numbered steps to fix the issue
//   example: string — a short corrected-code snippet demonstrating the fix
//
// To add a new entry, append a key matching the technique ID used in Pa11y
// rule codes (the token after the last dot-separated segment, e.g. 'H37' from
// 'WCAG2A.Principle1.Guideline1_1.1_1_1.H37').

module.exports = function getRemediationGuidance() {
	return {

		// ── Screen-Reader Blocking ─────────────────────────────────────────────

		H37: {
			steps: [
				'1. Locate the <img> element in the source.',
				'2. Add an alt attribute that concisely describes the image content or its function.',
				'3. If the image is decorative and conveys no information, use alt="" (empty string).',
				'4. If the image is complex (chart, diagram), also provide a longer text description nearby.'
			].join('\n'),
			example: '<img src="logo.png" alt="Acme Corporation logo">'
		},

		H44: {
			steps: [
				'1. Ensure every <input>, <select>, and <textarea> has a matching <label>.',
				'2. Set the label\'s for attribute to exactly the id of the control.',
				'3. The id must be unique within the page.',
				'4. Place the label immediately before (or after, for checkboxes/radios) the control.',
				'5. If a visible label is not possible, use aria-label or aria-labelledby instead.'
			].join('\n'),
			example: '<label for="email">Email address</label>\n<input type="email" id="email" name="email" autocomplete="email">'
		},

		// ── Colour Contrast ───────────────────────────────────────────────────

		G18: {
			steps: [
				'1. Identify the foreground text colour and the background colour behind it.',
				'2. Use a contrast checker (e.g. WebAIM Contrast Checker) to measure the ratio.',
				'3. Normal text (< 18pt / < 14pt bold) requires at least 4.5:1.',
				'4. Large text (≥ 18pt or ≥ 14pt bold) requires at least 3:1.',
				'5. Adjust one or both colours until the required threshold is met.',
				'6. Verify readability in high-contrast mode (e.g. Windows High Contrast).'
			].join('\n'),
			example: '/* After fix: colour #696969 on #ffffff = 4.61:1 (passes AA) */\n.body-text { color: #696969; background-color: #ffffff; }'
		},

		// ── General ───────────────────────────────────────────────────────────

		H57: {
			steps: [
				'1. Open the HTML source and locate the opening <html> tag.',
				'2. Add a lang attribute whose value is a valid BCP 47 language tag (e.g. "en", "fr", "ar").',
				'3. Choose the tag that best represents the primary language of the page content.',
				'4. If the page is served as XHTML, also set xml:lang to the same value.'
			].join('\n'),
			example: '<!DOCTYPE html>\n<html lang="en">\n  <head>…</head>\n  <body>…</body>\n</html>'
		},

		H25: {
			steps: [
				'1. Ensure a <title> element is present inside the <head> section.',
				'2. The title must be non-empty and describe the purpose or topic of the page.',
				'3. Make titles unique across the site — include both the page name and the site name.',
				'4. Keep titles concise (typically under 60 characters) but descriptive.'
			].join('\n'),
			example: '<head>\n  <title>Contact Us — Acme Corporation</title>\n</head>'
		},

		H30: {
			steps: [
				'1. Review every <a> element whose only content is an <img>.',
				'2. Add meaningful alt text to the image that describes the link destination, not the image itself.',
				'3. For text links, ensure the link text is descriptive on its own (avoid "click here" or "read more").',
				'4. If additional context is needed, use aria-label or aria-labelledby on the <a> element.'
			].join('\n'),
			example: '<a href="/home">\n  <img src="logo.png" alt="Acme Corporation — home page">\n</a>'
		},

		H42: {
			steps: [
				'1. Identify text that visually functions as a heading (section title, sub-title, etc.).',
				'2. Wrap it in the appropriate heading element: <h1> for the main page title, <h2>–<h6> for sub-sections.',
				'3. Maintain a logical nesting order — do not skip levels (e.g. h1 → h3 without an h2).',
				'4. Do not use heading tags purely for visual styling; use CSS instead.',
				'5. Avoid empty heading elements — they confuse screen-reader users navigating by headings.'
			].join('\n'),
			example: '<h1>Annual Report 2024</h1>\n<h2>Financial Summary</h2>\n<h3>Revenue</h3>'
		},

		H64: {
			steps: [
				'1. Locate every <iframe> element in the source.',
				'2. Add a title attribute whose value briefly describes the frame\'s content or purpose.',
				'3. Ensure the title is unique if multiple iframes are present on the same page.',
				'4. If the iframe is purely decorative (e.g. a spacer), use title="" and aria-hidden="true".'
			].join('\n'),
			example: '<iframe\n  src="map.html"\n  title="Interactive map showing store locations"\n></iframe>'
		}

	};
};
