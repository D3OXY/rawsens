import type { UpdatePolicy, UpdateState } from "../shared/rpc";
import { desktopRpc } from "./desktop-rpc";

const fallbackState: UpdateState = {
	policy: "notify",
	phase: "idle",
	currentVersion: "dev",
	latestVersion: null,
	message: "Connecting to the desktop runtime…",
};

let state = fallbackState;
const listeners = new Set<() => void>();

function publish(next: UpdateState): void {
	state = next;
	for (const listener of listeners) listener();
}

desktopRpc.subscribe("updateStateChanged", publish);

function desktopOnly(): Promise<UpdateState> {
	publish({
		...state,
		message: "Update controls require the desktop build",
	});
	return Promise.resolve(state);
}

export const updateClient = {
	apply: () =>
		desktopRpc.isAvailable
			? desktopRpc.request().applyUpdate({})
			: desktopOnly(),
	check: () =>
		desktopRpc.isAvailable
			? desktopRpc.request().checkForUpdates({})
			: desktopOnly(),
	download: () =>
		desktopRpc.isAvailable
			? desktopRpc.request().downloadUpdate({})
			: desktopOnly(),
	getSnapshot: () => state,
	initialize: async () =>
		publish(
			desktopRpc.isAvailable
				? await desktopRpc.request().getUpdateState({})
				: { ...state, message: "Web preview—desktop bridge offline" },
		),
	setPolicy: async (policy: UpdatePolicy) =>
		desktopRpc.isAvailable
			? publish(await desktopRpc.request().setUpdatePolicy({ policy }))
			: publish({ ...state, policy }),
	subscribe: (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};
