import { describe, expect, test } from "bun:test";
import {
	capabilityFromHelper,
	inputModeComparisonWarning,
	parseNativeHelperMessage,
} from "./input-protocol";

describe("native input protocol", () => {
	test("parses validated movement and capture events", () => {
		expect(
			parseNativeHelperMessage(
				'{"type":"move","captureId":2,"timestampUs":42,"deltaX":-3,"deltaY":5}',
			),
		).toEqual({
			type: "move",
			captureId: 2,
			timestampUs: 42,
			deltaX: -3,
			deltaY: 5,
		});
		expect(
			parseNativeHelperMessage(
				'{"type":"capture","state":"lost","captureId":2,"timestampUs":50,"mode":"native-relative","reason":"focus"}',
			),
		).toEqual({
			type: "capture",
			state: "lost",
			captureId: 2,
			timestampUs: 50,
			mode: "native-relative",
			reason: "focus",
		});
	});

	test("rejects malformed and unknown messages", () => {
		expect(parseNativeHelperMessage("not json")).toBeNull();
		expect(
			parseNativeHelperMessage(
				'{"type":"move","captureId":1,"timestampUs":2,"deltaX":"3","deltaY":4}',
			),
		).toBeNull();
		expect(parseNativeHelperMessage('{"type":"key"}')).toBeNull();
	});

	test("uses compatibility mode until native input is actually available", () => {
		const message = parseNativeHelperMessage(
			'{"type":"capability","platform":"macos","nativeMode":"native-relative","status":"permission-required","detail":"Permission needed"}',
		);
		if (message?.type !== "capability")
			throw new Error("Expected capability message");

		expect(capabilityFromHelper(message)).toEqual({
			platform: "macos",
			activeMode: "compatibility-relative",
			nativeMode: "native-relative",
			status: "permission-required",
			detail: "Permission needed",
			canRequestPermission: true,
		});
	});

	test("warns when observations came from different input modes", () => {
		expect(
			inputModeComparisonWarning("hardware-raw", "compatibility-relative"),
		).toContain("Compare these results cautiously");
		expect(
			inputModeComparisonWarning("native-relative", "native-relative"),
		).toBeNull();
	});
});
