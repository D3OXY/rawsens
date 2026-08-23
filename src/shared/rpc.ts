import type { RPCSchema } from "electrobun/main";

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
			updateStateChanged: UpdateState;
		};
	}>;
};
