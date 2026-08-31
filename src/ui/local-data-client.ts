import type {
	LocalData,
	LocalSettings,
	Profile,
	StoredSession,
} from "../shared/local-data";
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
	message?: string,
): Promise<LocalData> {
	try {
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
			"Local history ready",
		);
	},
	updateSettings: (settings: LocalSettings) =>
		runMutation(() => desktopRpc.request().saveLocalSettings({ settings })),
	upsertProfile: (profile: Profile) =>
		runMutation(() => desktopRpc.request().upsertProfile({ profile })),
	removeProfile: (profileId: string) =>
		runMutation(() => desktopRpc.request().removeProfile({ profileId })),
	saveSession: (session: StoredSession) =>
		runMutation(() => desktopRpc.request().saveSession({ session })),
	removeSession: (sessionId: string) =>
		runMutation(() => desktopRpc.request().removeSession({ sessionId })),
	importJson: (json: string) =>
		runMutation(
			() => desktopRpc.request().importLocalData({ json }),
			"Import complete",
		),
	exportJson: () => {
		if (!desktopRpc.isAvailable) {
			throw new Error("Export requires the desktop app.");
		}
		return desktopRpc.request().exportLocalData({});
	},
	subscribe: (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
