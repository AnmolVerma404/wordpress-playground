import { test, expect } from '../playground-fixtures';

/**
 * Verifies legacy Blueprint Builder URLs redirect to the Playground Blueprint
 * Editor while preserving URL fragments/query params and without executing
 * untrusted markup from an invalid Blueprint fragment.
 */

test('Blueprint Builder redirects to Blueprint Editor and preserves fragment without executing markup', async ({
	page,
}) => {
	const payload = `<img src=x onerror="parent.document.title='xss-executed'">`;
	const blueprint = JSON.stringify({ version: 2, [payload]: 1 });

	await page.goto(`./builder/builder.html#${encodeURIComponent(blueprint)}`);

	await page.waitForURL((url) => url.searchParams.has('blueprint-editor'), {
		timeout: 30000,
	});
	expect(new URL(page.url()).hash).toBe(`#${encodeURIComponent(blueprint)}`);

	await page.waitForTimeout(1000);
	expect(await page.title()).not.toBe('xss-executed');
});

test('Blueprint Builder redirects to Blueprint Editor preserving query params and hash', async ({
	page,
}) => {
	const blueprint = JSON.stringify({
		landingPage: '/wp-admin/plugins.php',
		login: true,
	});

	await page.goto(
		`./builder/builder.html?php=8.4#${encodeURIComponent(blueprint)}`
	);

	await page.waitForURL((url) => url.searchParams.has('blueprint-editor'), {
		timeout: 30000,
	});
	const redirectedUrl = new URL(page.url());
	expect(redirectedUrl.searchParams.get('php')).toBe('8.4');
	expect(redirectedUrl.hash).toBe(`#${encodeURIComponent(blueprint)}`);
});
