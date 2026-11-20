import { configureStore, createSelector } from '@reduxjs/toolkit';
import uiReducer, { listenToOnlineOfflineEventsMiddleware } from './slice-ui';
import { siteManagementMiddleware } from './site-management-api-middleware';
import { mcpBridgeMiddleware } from './init-mcp-bridge';
import sitesReducer, {
	isStoredSite,
	selectTemporarySite,
	selectTemporarySites,
} from './slice-sites';
import {
	selectActiveSite,
	selectActiveSiteError,
	selectActiveSiteErrorDetails,
	setActiveSite,
} from './active-site';
import type { ClientInfo } from './slice-clients';
import clientsReducer, { selectAllClientInfo } from './slice-clients';
import { useDispatch, useSelector } from 'react-redux';

export {
	selectActiveSite,
	selectActiveSiteError,
	selectActiveSiteErrorDetails,
	setActiveSite,
};

// NOTE: A GetDefaultMiddleware type is not exported from @reduxjs/toolkit,
// so we have to derive it from the configureStore() signature.
type ConfigureStoreOptions<T> = Parameters<typeof configureStore<T>>[0];
type ConfigureStoreOptionsMiddleware<T> = NonNullable<
	ConfigureStoreOptions<T>['middleware']
>;
type GetDefaultMiddleware<T> = Parameters<
	ConfigureStoreOptionsMiddleware<T>
>[0];

function ignoreSerializableCheck<S>(
	getDefaultMiddleware: GetDefaultMiddleware<S>
) {
	return getDefaultMiddleware({
		serializableCheck: {
			// Ignore these action types
			ignoredActions: [
				'clients/addClientInfo',
				'clients/updateClientInfo',
				'sites/addSite',
				'sites/setFirstTemporarySiteCreated',
				'ui/setActiveSite',
			],
			// Ignore these field paths in all actions
			ignoredActionPaths: [
				/payload\.(changes\.)?client/,
				/payload\.email/,
				/payload\.(changes\.)?opfsMountDescriptor\.device\.handle/,
				/.+\.originalBlueprint/,
			],
			// Ignore these paths in the state
			ignoredPaths: [
				/clients\.entities\.[^.]+\.client/,
				/clients\.entities\.[^.]+\.emails/,
				/clients\.entities\.[^.]+\.opfsMountDescriptor\.device\.handle/,
				/.+\.originalBlueprint/,
			],
		},
	});
}

const store = configureStore({
	reducer: {
		ui: uiReducer,
		sites: sitesReducer,
		clients: clientsReducer,
	},
	middleware: (getDefaultMiddleware) =>
		ignoreSerializableCheck(getDefaultMiddleware)
			.concat(listenToOnlineOfflineEventsMiddleware)
			.concat(siteManagementMiddleware.middleware)
			.concat(mcpBridgeMiddleware.middleware),
});

export type RootState = ReturnType<typeof store.getState>;

export function useAppSelector<T>(
	selector: (state: PlaygroundReduxState) => T
): T {
	return useSelector(selector);
}

export function useAppDispatch() {
	return useDispatch<PlaygroundDispatch>();
}

/**
 * Returns the active site only when it has durable storage. Autosaves count as
 * stored; callers that need an explicit save should use isExplicitlySavedSite.
 */
export const selectActiveStoredSite = createSelector(
	[selectActiveSite],
	(activeSite) =>
		activeSite && isStoredSite(activeSite) ? activeSite : undefined
);

export const useActiveSite = () => useAppSelector(selectActiveSite);

/**
 * Returns the active site only when it has a durable storage backend.
 */
export const useActiveStoredSite = () => useAppSelector(selectActiveStoredSite);

const YOU_HAVE_AUTOSAVE_NUDGE_ENABLED_STORAGE_KEY =
	'playground-you-have-autosave-nudge-enabled';

/** Reads whether matching autosaves should be offered on the current device. */
export function isYouHaveAutosaveNudgeEnabled(): boolean {
	try {
		return (
			localStorage.getItem(
				YOU_HAVE_AUTOSAVE_NUDGE_ENABLED_STORAGE_KEY
			) !== 'false'
		);
	} catch {
		return true;
	}
}

/** Persists whether matching autosaves should be offered on the current device. */
export function setYouHaveAutosaveNudgeEnabled(enabled: boolean): void {
	try {
		localStorage.setItem(
			YOU_HAVE_AUTOSAVE_NUDGE_ENABLED_STORAGE_KEY,
			String(enabled)
		);
	} catch {
		// The current dismissal still succeeds when private storage is unavailable.
	}
}

/**
 * Returns the temporary site for the current browser session, when one exists.
 */
export const useTemporarySite = () => useAppSelector(selectTemporarySite);

export const getActiveClientInfo = (
	state: PlaygroundReduxState
): ClientInfo | undefined =>
	state.ui.activeSite?.slug
		? state.clients.entities[state.ui.activeSite.slug]
		: undefined;

export const selectBootedTemporarySites = createSelector(
	selectAllClientInfo,
	selectTemporarySites,
	(clientInfo, temporarySites) => {
		return temporarySites.filter((site) =>
			clientInfo.some((client) => client.siteSlug === site.slug)
		);
	}
);

// Define RootState type
export type PlaygroundReduxState = ReturnType<typeof store.getState>;

// Define AppDispatch type
export type PlaygroundDispatch = typeof store.dispatch;

export default store;
