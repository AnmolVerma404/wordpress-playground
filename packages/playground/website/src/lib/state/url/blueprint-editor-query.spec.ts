import { describe, expect, it } from 'vitest';
import {
	buildBlueprintEditorRedirectUrl,
	shouldUseBlueprintEditorQuery,
} from './blueprint-editor-query';

describe('blueprint-editor URL helpers', () => {
	it('enables blueprint-editor only outside seamless mode and iframes', () => {
		expect(
			shouldUseBlueprintEditorQuery(
				new URLSearchParams('blueprint-editor'),
				false
			)
		).toBe(true);
		expect(
			shouldUseBlueprintEditorQuery(
				new URLSearchParams('blueprint-editor&mode=seamless'),
				false
			)
		).toBe(false);
		expect(
			shouldUseBlueprintEditorQuery(
				new URLSearchParams('blueprint-editor'),
				true
			)
		).toBe(false);
	});

	it('redirects /builder/builder.html to app root with blueprint-editor and preserves hash', () => {
		const hash =
			'#%7B%22landingPage%22%3A%22%2Fwp-admin%2Fplugins.php%22%2C%22login%22%3Atrue%7D';
		expect(
			buildBlueprintEditorRedirectUrl(
				`https://playground.wordpress.net/builder/builder.html${hash}`
			)
		).toBe(`https://playground.wordpress.net/?blueprint-editor${hash}`);
	});

	it('preserves subpath roots, existing query params, and avoids duplicating blueprint-editor', () => {
		expect(
			buildBlueprintEditorRedirectUrl(
				'http://localhost:5400/website-server/builder/builder.html?blueprint-url=https%3A%2F%2Fexample.com%2Fbp.json#foo'
			)
		).toBe(
			'http://localhost:5400/website-server/?blueprint-url=https%3A%2F%2Fexample.com%2Fbp.json&blueprint-editor#foo'
		);

		expect(
			buildBlueprintEditorRedirectUrl(
				'https://playground.wordpress.net/builder/builder.html?blueprint-editor&php=8.4'
			)
		).toBe('https://playground.wordpress.net/?blueprint-editor&php=8.4');
	});
});
