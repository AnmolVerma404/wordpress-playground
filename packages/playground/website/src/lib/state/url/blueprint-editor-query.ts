/**
 * Enables opening the Blueprint Editor Dock pane on startup only where the
 * standalone Playground UI is available.
 */
export function shouldUseBlueprintEditorQuery(
	searchParams: URLSearchParams,
	isEmbeddedInIframe: boolean
) {
	return (
		searchParams.has('blueprint-editor') &&
		searchParams.get('mode') !== 'seamless' &&
		!isEmbeddedInIframe
	);
}

/**
 * Builds the Playground Blueprint Editor URL for a legacy Blueprint Builder
 * location, preserving existing query parameters and any URL fragment.
 */
export function buildBlueprintEditorRedirectUrl(currentHref: string): string {
	const currentUrl = new URL(currentHref);
	const targetUrl = new URL('..', currentUrl);
	const targetParams = new URLSearchParams(currentUrl.search);
	if (!targetParams.has('blueprint-editor')) {
		targetParams.set('blueprint-editor', '');
	}
	const serializedParams = Array.from(targetParams.entries())
		.map(([key, value]) =>
			value === ''
				? encodeURIComponent(key)
				: `${encodeURIComponent(key)}=${encodeURIComponent(value)}`
		)
		.join('&');
	targetUrl.search = serializedParams ? `?${serializedParams}` : '';
	targetUrl.hash = currentUrl.hash;
	return targetUrl.toString();
}
