import { type InputMode, inputModes } from "../domain/calibration-types";

export const inputPlatforms = [
	"windows",
	"macos",
	"web",
	"unsupported",
] as const;
export type InputPlatform = (typeof inputPlatforms)[number];

export const inputCapabilityStatuses = [
	"checking",
	"available",
	"permission-required",
	"unsupported",
	"error",
] as const;
export type InputCapabilityStatus = (typeof inputCapabilityStatuses)[number];

export type InputCapability = {
	platform: InputPlatform;
	activeMode: InputMode;
	nativeMode: Exclude<InputMode, "compatibility-relative"> | null;
	status: InputCapabilityStatus;
	detail: string;
	canRequestPermission: boolean;
};

export type InputButton =
	| "primary"
	| "secondary"
	| "middle"
	| "back"
	| "forward"
	| "other";

export type InputSample =
	| {
			type: "move";
			captureId: number;
			timestampUs: number;
			deltaX: number;
			deltaY: number;
	  }
	| {
			type: "button";
			captureId: number;
			timestampUs: number;
			button: InputButton;
			pressed: boolean;
	  };

export type InputPacket = {
	captureId: number;
	samples: readonly InputSample[];
};

export type InputCaptureEvent = {
	state: "started" | "stopped" | "lost";
	captureId: number;
	timestampUs: number;
	mode: InputMode;
	reason: string;
};

export type NativeHelperMessage =
	| {
			type: "capability";
			platform: Exclude<InputPlatform, "web">;
			nativeMode: Exclude<InputMode, "compatibility-relative"> | null;
			status: Exclude<InputCapabilityStatus, "checking">;
			detail: string;
	  }
	| ({ type: "capture" } & InputCaptureEvent)
	| InputSample;

const buttons: readonly InputButton[] = [
	"primary",
	"secondary",
	"middle",
	"back",
	"forward",
	"other",
];

export function parseNativeHelperMessage(
	line: string,
): NativeHelperMessage | null {
	let value: unknown;
	try {
		value = JSON.parse(line);
	} catch {
		return null;
	}
	if (!isRecord(value) || typeof value.type !== "string") return null;

	switch (value.type) {
		case "capability":
			if (
				!isOneOf(value.platform, ["windows", "macos", "unsupported"]) ||
				!isNativeMode(value.nativeMode) ||
				!isOneOf(value.status, [
					"available",
					"permission-required",
					"unsupported",
					"error",
				]) ||
				typeof value.detail !== "string"
			)
				return null;
			return {
				type: "capability",
				platform: value.platform,
				nativeMode: value.nativeMode,
				status: value.status,
				detail: value.detail,
			};
		case "capture":
			if (
				!isOneOf(value.state, ["started", "stopped", "lost"]) ||
				!isNonnegativeNumber(value.captureId) ||
				!isNonnegativeNumber(value.timestampUs) ||
				!isOneOf(value.mode, inputModes) ||
				typeof value.reason !== "string"
			)
				return null;
			return {
				type: "capture",
				state: value.state,
				captureId: value.captureId,
				timestampUs: value.timestampUs,
				mode: value.mode,
				reason: value.reason,
			};
		case "move":
			if (
				!isNonnegativeNumber(value.captureId) ||
				!isNonnegativeNumber(value.timestampUs) ||
				!isFiniteNumber(value.deltaX) ||
				!isFiniteNumber(value.deltaY)
			)
				return null;
			return {
				type: "move",
				captureId: value.captureId,
				timestampUs: value.timestampUs,
				deltaX: value.deltaX,
				deltaY: value.deltaY,
			};
		case "button":
			if (
				!isNonnegativeNumber(value.captureId) ||
				!isNonnegativeNumber(value.timestampUs) ||
				!isOneOf(value.button, buttons) ||
				typeof value.pressed !== "boolean"
			)
				return null;
			return {
				type: "button",
				captureId: value.captureId,
				timestampUs: value.timestampUs,
				button: value.button,
				pressed: value.pressed,
			};
		default:
			return null;
	}
}

export function capabilityFromHelper(
	message: Extract<NativeHelperMessage, { type: "capability" }>,
): InputCapability {
	return {
		platform: message.platform,
		activeMode:
			message.status === "available" && message.nativeMode
				? message.nativeMode
				: "compatibility-relative",
		nativeMode: message.nativeMode,
		status: message.status,
		detail: message.detail,
		canRequestPermission:
			message.platform === "macos" && message.status === "permission-required",
	};
}

export function inputModeComparisonWarning(
	left: InputMode,
	right: InputMode,
): string | null {
	if (left === right) return null;
	return `Input modes differ (${formatInputMode(left)} vs ${formatInputMode(right)}). Compare these results cautiously.`;
}

export function formatInputMode(mode: InputMode): string {
	switch (mode) {
		case "hardware-raw":
			return "Hardware Raw Input";
		case "native-relative":
			return "Native relative input";
		case "compatibility-relative":
			return "Compatibility input";
	}
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function isNonnegativeNumber(value: unknown): value is number {
	return isFiniteNumber(value) && value >= 0;
}

function isFiniteNumber(value: unknown): value is number {
	return typeof value === "number" && Number.isFinite(value);
}

function isNativeMode(
	value: unknown,
): value is Exclude<InputMode, "compatibility-relative"> | null {
	return (
		value === null || value === "hardware-raw" || value === "native-relative"
	);
}

function isOneOf<const Values extends readonly unknown[]>(
	value: unknown,
	values: Values,
): value is Values[number] {
	return values.includes(value);
}
