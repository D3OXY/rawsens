import type {
	LocalData,
	LocalSettings,
	Profile,
	StoredSession,
} from "../shared/local-data";
import { exportLocalData, importLocalData } from "../shared/local-data";
import { desktopRpc } from "./desktop-rpc";

type LocalDataClientState = {
	data: LocalData;
	available: boolean;
	phase: "loading" | "ready" | "error";
	message: string;
};

let state: LocalDataClientState = {
	data: {
		schemaVersion: 1,
		settings: {
			theme: "system",
			updatePolicy: "notify",
			defaultProfileId: null,
			ai: {
				enabled: false,
				access: "free-proxy",
				modelId: "stealth/ox-alpha",
				disclosureAcceptedAt: null,
			},
		},
		profiles: [],
		sessions: [],
	},
	available: desktopRpc.isAvailable,
	phase: "loading",
	message: "Loading local history…",
};
const listeners = new Set<() => void>();

function publish(next: LocalDataClientState): void {
	state = next;
	for (const listener of listeners) listener();
}

function publishData(
	data: LocalData,
	message = "Saved on this device",
): LocalData {
	publish({ data, available: desktopRpc.isAvailable, phase: "ready", message });
	return data;
}

async function runMutation(
	request: () => Promise<LocalData>,
	preview: (data: LocalData) => LocalData,
	message?: string,
): Promise<LocalData> {
	try {
		if (!desktopRpc.isAvailable) {
			return publishData(preview(state.data), message ?? "Web preview updated");
		}
		return publishData(await request(), message);
	} catch (error) {
		publish({ ...state, phase: "error", message: errorMessage(error) });
		throw error;
	}
}

export const localDataClient = {
	getSnapshot: () => state,
	initialize: async () => {
		if (!desktopRpc.isAvailable) {
			publish({
				...state,
				available: false,
				phase: "ready",
				message: "Web preview—device history unavailable",
			});
			return state.data;
		}
		return runMutation(
			() => desktopRpc.request().getLocalData({}),
			(data) => data,
			"Local history ready",
		);
	},
	updateSettings: (settings: LocalSettings) =>
		runMutation(
			() => desktopRpc.request().saveLocalSettings({ settings }),
			(data) => ({ ...data, settings }),
		),
	upsertProfile: (profile: Profile) =>
		runMutation(
			() => desktopRpc.request().upsertProfile({ profile }),
			(data) => ({
				...data,
				profiles: replaceById(data.profiles, profile),
			}),
		),
	removeProfile: (profileId: string) =>
		runMutation(
			() => desktopRpc.request().removeProfile({ profileId }),
			(data) => ({
				...data,
				profiles: data.profiles.filter((profile) => profile.id !== profileId),
				sessions: data.sessions.map((session) =>
					session.profileId === profileId
						? { ...session, profileId: null }
						: session,
				),
				settings: {
					...data.settings,
					defaultProfileId:
						data.settings.defaultProfileId === profileId
							? null
							: data.settings.defaultProfileId,
				},
			}),
		),
	saveSession: (session: StoredSession) =>
		runMutation(
			() => desktopRpc.request().saveSession({ session }),
			(data) => ({
				...data,
				sessions: replaceById(data.sessions, session),
			}),
		),
	removeSession: (sessionId: string) =>
		runMutation(
			() => desktopRpc.request().removeSession({ sessionId }),
			(data) => ({
				...data,
				sessions: data.sessions.filter((session) => session.id !== sessionId),
			}),
		),
	importJson: (json: string) =>
		runMutation(
			() => desktopRpc.request().importLocalData({ json }),
			() => importLocalData(json),
			"Import complete",
		),
	exportJson: () => {
		if (!desktopRpc.isAvailable) {
			return Promise.resolve({
				json: exportLocalData(state.data),
				suggestedName: `rawsens-preview-${new Date().toISOString().slice(0, 10)}.json`,
			});
		}
		return desktopRpc.request().exportLocalData({});
	},
	subscribe: (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

function replaceById<Item extends { id: string }>(
	items: readonly Item[],
	next: Item,
): Item[] {
	return items.some((item) => item.id === next.id)
		? items.map((item) => (item.id === next.id ? next : item))
		: [...items, next];
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
