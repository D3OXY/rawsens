import Electrobun, { Electroview } from "electrobun/view";
import type { RawSensRPC, UpdatePolicy, UpdateState } from "../shared/rpc";

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

const rpc = Electroview.defineRPC<RawSensRPC>({
	maxRequestTime: 30_000,
	handlers: {
		requests: {},
		messages: {
			updateStateChanged: publish,
		},
	},
});

const electrobun =
	"__electrobun" in window ? new Electrobun.Electroview({ rpc }) : null;

function requests() {
	if (!electrobun?.rpc) throw new Error("Electrobun RPC is unavailable");
	return electrobun.rpc.request;
}

function desktopOnly(): Promise<UpdateState> {
	publish({
		...state,
		message: "Update controls require the desktop build",
	});
	return Promise.resolve(state);
}

export const updateClient = {
	apply: () => (electrobun ? requests().applyUpdate({}) : desktopOnly()),
	check: () => (electrobun ? requests().checkForUpdates({}) : desktopOnly()),
	download: () => (electrobun ? requests().downloadUpdate({}) : desktopOnly()),
	getSnapshot: () => state,
	initialize: async () =>
		publish(
			electrobun
				? await requests().getUpdateState({})
				: { ...state, message: "Web preview—desktop bridge offline" },
		),
	setPolicy: async (policy: UpdatePolicy) =>
		electrobun
			? publish(await requests().setUpdatePolicy({ policy }))
			: publish({ ...state, policy }),
	subscribe: (listener: () => void) => {
		listeners.add(listener);
		return () => listeners.delete(listener);
	},
};
