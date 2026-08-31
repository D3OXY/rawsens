import { describe, expect, test } from "bun:test";
import { convertCmPer360, convertSettingToCmPer360 } from "./game-conversion";
import {
	gameManifestById,
	gameManifests,
	type VerifiedGameManifest,
} from "./game-manifests";

const cs2ReferenceFixture = referenceFixture(
	"cs2-reference-fixture",
	"Counter-Strike 2 reference fixture",
	0.022,
	4,
);
const valorantReferenceFixture = referenceFixture(
	"valorant-reference-fixture",
	"VALORANT reference fixture",
	0.07,
	3,
);

describe("game conversion", () => {
	test("preserves the known CS2 to VALORANT reference fixture", () => {
		const cmPer360 = convertSettingToCmPer360(cs2ReferenceFixture, 1, 800);
		expect(cmPer360.ok).toBe(true);
		if (!cmPer360.ok) return;
		expect(cmPer360.value).toBeCloseTo(51.9545, 3);

		const converted = convertCmPer360(
			valorantReferenceFixture,
			cmPer360.value,
			800,
		);
		expect(converted).toMatchObject({ ok: true, displayValue: "0.314" });
	});

	test("round trips verified manifests within their declared display step", () => {
		const verifiedManifests = [
			...gameManifests.filter(
				(manifest) => manifest.conversion.kind !== "unavailable",
			),
			cs2ReferenceFixture,
			valorantReferenceFixture,
		];

		for (const manifest of verifiedManifests) {
			if (manifest.conversion.kind === "unavailable") continue;
			const converted = convertCmPer360(manifest, 40, 800);
			expect(converted.ok, manifest.displayName).toBe(true);
			if (!converted.ok) continue;
			const restored = convertSettingToCmPer360(manifest, converted.value, 800);
			expect(restored.ok, manifest.displayName).toBe(true);
			if (!restored.ok) continue;

			const displayStep = 10 ** -manifest.conversion.decimalPlaces;
			const lower = Math.max(
				manifest.conversion.minimum,
				converted.value - displayStep / 2,
			);
			const upper = Math.min(
				manifest.conversion.maximum,
				converted.value + displayStep / 2,
			);
			const lowerCm = convertSettingToCmPer360(manifest, lower, 800);
			const upperCm = convertSettingToCmPer360(manifest, upper, 800);
			expect(lowerCm.ok && upperCm.ok).toBe(true);
			if (!lowerCm.ok || !upperCm.ok) continue;
			expect(restored.value).toBeGreaterThanOrEqual(
				Math.min(lowerCm.value, upperCm.value),
			);
			expect(restored.value).toBeLessThanOrEqual(
				Math.max(lowerCm.value, upperCm.value),
			);
		}
	});

	test("returns typed errors for invalid inputs, ranges, and availability", () => {
		const cs2 = requiredManifest("counter-strike-2");
		const callOfDuty = requiredManifest("call-of-duty");
		expect(convertCmPer360(cs2ReferenceFixture, 40, 0)).toMatchObject({
			ok: false,
			code: "invalid-dpi",
		});
		expect(convertCmPer360(cs2ReferenceFixture, Number.NaN, 800)).toMatchObject(
			{
				ok: false,
				code: "invalid-cm-per-360",
			},
		);
		expect(convertCmPer360(cs2ReferenceFixture, 0.01, 800)).toMatchObject({
			ok: false,
			code: "out-of-range",
		});
		expect(convertCmPer360(cs2, 40, 800)).toMatchObject({
			ok: false,
			code: "unverified",
		});
		expect(convertCmPer360(callOfDuty, 40, 800)).toMatchObject({
			ok: false,
			code: "unsupported",
		});
	});
});

function referenceFixture(
	id: string,
	displayName: string,
	degreesPerCountPerSetting: number,
	decimalPlaces: number,
): VerifiedGameManifest {
	return {
		manifestVersion: "1.0.0",
		id,
		displayName,
		settingLabel: "Test-only sensitivity",
		settingLocation: "Not shipped",
		instructions: [],
		assumptions: [
			"This fixture verifies converter math only; it does not enable a production manifest.",
		],
		verifiedAt: "2026-08-23",
		sources: [],
		conversion: {
			kind: "linear-degrees-per-count",
			degreesPerCountPerSetting,
			minimum: 0.0001,
			maximum: 100,
			decimalPlaces,
			unit: "sensitivity",
		},
	};
}

function requiredManifest(id: string) {
	const manifest = gameManifestById(id);
	if (!manifest) throw new Error(`Missing game manifest: ${id}`);
	return manifest;
}
