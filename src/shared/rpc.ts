import type { RPCSchema } from "electrobun/main";
import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "./input-protocol";

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
