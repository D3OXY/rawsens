import { describe, expect, test } from "bun:test";
import { calibrationPolicy } from "./calibration-policy";
import type {
	FlickObservation,
	MicroObservation,
	SwitchingObservation,
	TrackingObservation,
} from "./calibration-types";
import { scoreTrial } from "./score-trial";

const base = {
	id: "trial-1",
	candidate: { id: "candidate-1", cmPer360: 40 },
	durationMs: 12_000,
	inputMode: "hardware-raw" as const,
	policyVersion: calibrationPolicy.version,
};

describe("scoreTrial", () => {
	test("scores accurate flicks higher than fast misses", () => {
		const accurate: FlickObservation = {
			...base,
			dimension: "flicking",
			attempts: 12,
			hits: 11,
			meanAcquisitionMs: 430,
			meanErrorRatio: 0.12,
			acquisitionVariation: 0.14,
		};
		const rushed: FlickObservation = {
			...accurate,
			id: "trial-2",
			hits: 6,
			meanAcquisitionMs: 260,
			meanErrorRatio: 0.8,
			acquisitionVariation: 0.4,
		};

		const accurateScore = scoreTrial(accurate);
		const rushedScore = scoreTrial(rushed);

		expect(accurateScore.accepted).toBe(true);
		expect(rushedScore.accepted).toBe(true);
		if (!accurateScore.accepted || !rushedScore.accepted) return;
		expect(accurateScore.score).toBeGreaterThan(rushedScore.score);
		expect(rushedScore.parts.speed).toBeGreaterThan(accurateScore.parts.speed);
	});

	test("scores each aim dimension", () => {
		const tracking: TrackingObservation = {
			...base,
			dimension: "tracking",
			sampleCount: 720,
			onTargetRatio: 0.78,
			meanErrorRatio: 0.25,
			errorVariation: 0.2,
			correctionEfficiency: 0.82,
		};
		const switching: SwitchingObservation = {
			...base,
			dimension: "target-switching",
			attempts: 18,
			hits: 15,
			meanTransitionMs: 390,
			meanErrorRatio: 0.2,
			transitionVariation: 0.16,
		};
		const micro: MicroObservation = {
			...base,
			dimension: "micro-correction",
			attempts: 10,
			hits: 9,
			meanSettleMs: 490,
			meanErrorRatio: 0.1,
			meanCorrections: 1.2,
			overshootRatio: 0.1,
		};

		for (const observation of [tracking, switching, micro]) {
			const result = scoreTrial(observation);
			expect(result.accepted).toBe(true);
			if (!result.accepted) continue;
			expect(result.score).toBeGreaterThan(0);
			expect(result.score).toBeLessThanOrEqual(100);
		}
	});

	test("rejects stale policy, impossible counts, and non-finite data", () => {
		const observation: FlickObservation = {
			...base,
			policyVersion: "old-policy",
			dimension: "flicking",
			attempts: 4,
			hits: 5,
			meanAcquisitionMs: Number.NaN,
			meanErrorRatio: -1,
			acquisitionVariation: 0.1,
		};

		const result = scoreTrial(observation);

		expect(result.accepted).toBe(false);
		if (result.accepted) return;
		expect(result.issues).toContain("policy version must be 2026-08-23.1");
		expect(result.issues).toContain("attempt count is too low");
		expect(result.issues).toContain("hits must be between zero and attempts");
		expect(result.issues).toContain("meanAcquisitionMs must be finite");
		expect(result.issues).toContain("meanErrorRatio cannot be negative");
	});

	test("rejects sensitivities outside the policy range", () => {
		const observation: TrackingObservation = {
			...base,
			candidate: { id: "candidate-1", cmPer360: 200 },
			dimension: "tracking",
			sampleCount: 120,
			onTargetRatio: 0.5,
			meanErrorRatio: 0.5,
			errorVariation: 0.3,
			correctionEfficiency: 0.5,
		};

		const result = scoreTrial(observation);
		expect(result.accepted).toBe(false);
		if (result.accepted) return;
		expect(result.issues).toContain(
			"candidate cmPer360 is outside policy bounds",
		);
	});

	test("rejects a non-finite candidate sensitivity", () => {
		const observation: TrackingObservation = {
			...base,
			candidate: { id: "candidate-1", cmPer360: Number.NaN },
			dimension: "tracking",
			sampleCount: 120,
			onTargetRatio: 0.5,
			meanErrorRatio: 0.5,
			errorVariation: 0.3,
			correctionEfficiency: 0.5,
		};

		const result = scoreTrial(observation);
		expect(result.accepted).toBe(false);
		if (result.accepted) return;
		expect(result.issues).toContain("candidate cmPer360 must be finite");
	});
});

describe("calibrationPolicy", () => {
	test("weights every dimension to one", () => {
		for (const dimension of Object.values(calibrationPolicy.dimensions)) {
			const total = Object.values(dimension.weights).reduce(
				(sum, weight) => sum + weight,
				0,
			);
			expect(total).toBeCloseTo(1);
		}
	});
});
