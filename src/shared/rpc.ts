import type { RPCSchema } from "electrobun/main";
import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "./input-protocol";
import type {
	CredentialState,
	LocalData,
	LocalSettings,
	Profile,
	StoredSession,
} from "./local-data";

export const updatePolicies = [
	"manual",
	"notify",
	"download",
	"automatic",
] as const;

export type UpdatePolicy = (typeof updatePolicies)[number];

export type UpdateState = {
	policy: UpdatePolicy;
	phase: "idle" | "checking" | "available" | "downloading" | "ready" | "error";
	currentVersion: string;
	latestVersion: string | null;
	message: string;
};

export type RawSensRPC = {
	bun: RPCSchema<{
		requests: {
			applyUpdate: { params: Record<string, never>; response: UpdateState };
			checkForUpdates: { params: Record<string, never>; response: UpdateState };
			downloadUpdate: { params: Record<string, never>; response: UpdateState };
			getUpdateState: { params: Record<string, never>; response: UpdateState };
			getInputCapability: {
				params: Record<string, never>;
				response: InputCapability;
			};
			getLocalData: {
				params: Record<string, never>;
				response: LocalData;
			};
			getCredentialState: {
				params: Record<string, never>;
				response: CredentialState;
			};
			exportLocalData: {
				params: Record<string, never>;
				response: { json: string; suggestedName: string };
			};
			importLocalData: {
				params: { json: string };
				response: LocalData;
			};
			removeProfile: {
				params: { profileId: string };
				response: LocalData;
			};
			removeSession: {
				params: { sessionId: string };
				response: LocalData;
			};
			saveLocalSettings: {
				params: { settings: LocalSettings };
				response: LocalData;
			};
			saveSession: {
				params: { session: StoredSession };
				response: LocalData;
			};
			upsertProfile: {
				params: { profile: Profile };
				response: LocalData;
			};
			setOpenRouterKey: {
				params: { key: string };
				response: CredentialState;
			};
			deleteOpenRouterKey: {
				params: Record<string, never>;
				response: CredentialState;
			};
			refreshInputCapability: {
				params: Record<string, never>;
				response: InputCapability;
			};
			requestInputPermission: {
				params: Record<string, never>;
				response: InputCapability;
			};
			startInputCapture: {
				params: Record<string, never>;
				response: InputCapability;
			};
			stopInputCapture: {
				params: Record<string, never>;
				response: InputCapability;
			};
			setUpdatePolicy: {
				params: { policy: UpdatePolicy };
				response: UpdateState;
			};
		};
		messages: Record<string, never>;
	}>;
	webview: RPCSchema<{
		requests: Record<string, never>;
		messages: {
			inputCapabilityChanged: InputCapability;
			inputCaptureChanged: InputCaptureEvent;
			inputPacket: InputPacket;
			updateStateChanged: UpdateState;
		};
	}>;
};
