import {
	type GameManifest,
	isVerifiedGameManifest,
	type VerifiedGameManifest,
} from "./game-manifests";

const centimetersPerInch = 2.54;
const degreesPerTurn = 360;

export type ConversionErrorCode =
	| "invalid-cm-per-360"
	| "invalid-dpi"
	| "out-of-range"
	| "unverified"
	| "unsupported";

export type ConversionResult =
	| {
			ok: true;
			value: number;
			displayValue: string;
			unit: string;
			effectiveCmPer360: number;
	  }
	| {
			ok: false;
			code: ConversionErrorCode;
			message: string;
	  };

export function convertCmPer360(
	manifest: GameManifest,
	cmPer360: number,
	dpi: number,
): ConversionResult {
	if (!Number.isFinite(cmPer360) || cmPer360 <= 0) {
		return failure("invalid-cm-per-360", "cm/360 must be a positive number.");
	}
	if (!Number.isFinite(dpi) || !Number.isInteger(dpi) || dpi <= 0) {
		return failure("invalid-dpi", "DPI must be a positive whole number.");
	}
	if (!isVerifiedGameManifest(manifest)) {
		return failure(manifest.conversion.status, manifest.conversion.reason);
	}

	const rawValue = rawSettingValue(manifest, cmPer360, dpi);
	if (
		rawValue < manifest.conversion.minimum ||
		rawValue > manifest.conversion.maximum
	) {
		return failure(
			"out-of-range",
			`${manifest.displayName} requires ${manifest.conversion.minimum}–${manifest.conversion.maximum} ${manifest.conversion.unit}.`,
		);
	}
	const value = roundTo(rawValue, manifest.conversion.decimalPlaces);
	return {
		ok: true,
		value,
		displayValue: value.toFixed(manifest.conversion.decimalPlaces),
		unit: manifest.conversion.unit,
		effectiveCmPer360: settingToCmPer360(manifest, value, dpi),
	};
}

export function convertSettingToCmPer360(
	manifest: GameManifest,
	value: number,
	dpi: number,
): ConversionResult {
	if (!Number.isFinite(dpi) || !Number.isInteger(dpi) || dpi <= 0) {
		return failure("invalid-dpi", "DPI must be a positive whole number.");
	}
	if (!isVerifiedGameManifest(manifest)) {
		return failure(manifest.conversion.status, manifest.conversion.reason);
	}
	if (
		!Number.isFinite(value) ||
		value < manifest.conversion.minimum ||
		value > manifest.conversion.maximum
	) {
		return failure(
			"out-of-range",
			`${manifest.displayName} requires ${manifest.conversion.minimum}–${manifest.conversion.maximum} ${manifest.conversion.unit}.`,
		);
	}
	const cmPer360 = settingToCmPer360(manifest, value, dpi);
	return {
		ok: true,
		value: cmPer360,
		displayValue: cmPer360.toFixed(2),
		unit: "cm/360",
		effectiveCmPer360: cmPer360,
	};
}

function rawSettingValue(
	manifest: VerifiedGameManifest,
	cmPer360: number,
	dpi: number,
): number {
	if (manifest.conversion.kind === "canonical") return cmPer360;
	return (
		(degreesPerTurn * centimetersPerInch) /
		(dpi * cmPer360 * manifest.conversion.degreesPerCountPerSetting)
	);
}

function settingToCmPer360(
	manifest: VerifiedGameManifest,
	value: number,
	dpi: number,
): number {
	if (manifest.conversion.kind === "canonical") return value;
	return (
		(degreesPerTurn * centimetersPerInch) /
		(dpi * value * manifest.conversion.degreesPerCountPerSetting)
	);
}

function roundTo(value: number, decimalPlaces: number): number {
	const scale = 10 ** decimalPlaces;
	return Math.round((value + Number.EPSILON) * scale) / scale;
}

function failure(code: ConversionErrorCode, message: string): ConversionResult {
	return { ok: false, code, message };
}
