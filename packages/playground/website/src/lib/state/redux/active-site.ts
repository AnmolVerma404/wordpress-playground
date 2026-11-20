import type { PlaygroundDispatch, PlaygroundReduxState } from './store';
import type { SiteInfo } from './slice-sites';
import type { SiteError, SerializedSiteErrorDetails } from './slice-ui';
import { __internal_uiSlice } from './slice-ui';
import { PlaygroundRoute, redirectTo } from '../url/router';

export const selectActiveSite = (
	state: PlaygroundReduxState
): SiteInfo | undefined =>
	state.ui.activeSite?.slug
		? state.sites.entities[state.ui.activeSite.slug]
		: undefined;

export const selectActiveSiteError = (
	state: PlaygroundReduxState
): SiteError | undefined =>
	state.ui.activeSite?.slug ? state.ui.activeSite.error : undefined;

export const selectActiveSiteErrorDetails = (
	state: PlaygroundReduxState
): SerializedSiteErrorDetails | undefined =>
	state.ui.activeSite?.slug ? state.ui.activeSite.errorDetails : undefined;

export const setActiveSite = (
	slug: string | undefined,
	options: { updateUrl?: boolean } = {}
) => {
	return (
		dispatch: PlaygroundDispatch,
		getState: () => PlaygroundReduxState
	) => {
		// Short-circuit if the provided slug already points to the active site.
		const activeSite = selectActiveSite(getState());
		if (activeSite?.slug === slug) {
			return;
		}
		dispatch(__internal_uiSlice.actions.setActiveSite(slug));
		if (slug && options.updateUrl !== false) {
			const site = getState().sites.entities[slug];
			redirectTo(PlaygroundRoute.site(site));
		}
	};
};
