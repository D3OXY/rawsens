import { describe, expect, test } from "bun:test";
import type { AimDimension } from "../domain/calibration-types";
import type { TrialSpec } from "../domain/session-types";
import { TrialRecorder } from "./trial-recorder";

describe("TrialRecorder", () => {
	test("aggregates click trials in target-radius units", () => {
		const recorder = new TrialRecorder(spec("flicking"), "hardware-raw");
		for (let index = 0; index < 10; index += 1) {
			recorder.recordClick({
				atMs: 300 + index * 400,
				targetShownAtMs: index * 400,
				pointer: { x: index < 8 ? 100 : 140, y: 100 },
				target: { x: 100, y: 100, radius: 20 },
			});
		}

		const observation = recorder.finish();
		expect(observation.dimension).toBe("flicking");
		if (observation.dimension !== "flicking") return;
		expect(observation.attempts).toBe(10);
		expect(observation.hits).toBe(8);
		expect(observation.meanAcquisitionMs).toBe(300);
		expect(observation.meanErrorRatio).toBeCloseTo(0.4);
	});

	test("aggregates tracking samples and movement efficiency", () => {
		const recorder = new TrialRecorder(spec("tracking"), "native-relative");
		for (let index = 0; index < 120; index += 1) {
			recorder.recordSample({
				atMs: index * 16,
				pointer: { x: 50 + index / 10, y: 50 },
				target: { x: 60 + index / 10, y: 50, radius: 20 },
			});
		}

		const observation = recorder.finish();
		expect(observation.dimension).toBe("tracking");
		if (observation.dimension !== "tracking") return;
		expect(observation.sampleCount).toBe(120);
		expect(observation.onTargetRatio).toBe(1);
		expect(observation.meanErrorRatio).toBeCloseTo(0.5);
	});

	test("counts micro-correction direction changes", () => {
		const recorder = new TrialRecorder(
			spec("micro-correction"),
			"compatibility-relative",
		);
		for (const x of [4, 3, -2, -1, 1]) recorder.recordMove({ x, y: 0 });
		for (let index = 0; index < 5; index += 1) {
			recorder.recordClick({
				atMs: 500 + index * 500,
				targetShownAtMs: index * 500,
				pointer: { x: 100, y: 100 },
				target: { x: 100, y: 100, radius: 18 },
			});
		}

		const observation = recorder.finish();
		expect(observation.dimension).toBe("micro-correction");
		if (observation.dimension !== "micro-correction") return;
		expect(observation.meanCorrections).toBeGreaterThan(1);
		expect(observation.overshootRatio).toBeGreaterThan(0);
	});
});

function spec(dimension: AimDimension): TrialSpec {
	return {
		id: `trial-${dimension}`,
		stage: "screening",
		dimension,
		candidate: { id: "sens-40", cmPer360: 40 },
		durationMs: 12_000,
		blindLabel: null,
		attempt: 1,
	};
}
