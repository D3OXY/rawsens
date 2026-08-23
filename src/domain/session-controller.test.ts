import { describe, expect, test } from "bun:test";
import { calibrationPolicy } from "./calibration-policy";
import {
	createSession,
	offerAiTrial,
	pauseSession,
	recordTrial,
	resumeSession,
} from "./session-controller";
import {
	acceptedResult,
	invalidResult,
	pendingTrial,
} from "./session-test-fixtures";
import type { SessionState } from "./session-types";

const config = {
	id: "session-1",
	baselineCmPer360: 40,
	inputMode: "hardware-raw" as const,
	seed: 9182,
};

describe("session controller", () => {
	test("builds the same shuffled protocol from the same seed", () => {
		const first = enterScreening(createSession(config));
		const second = enterScreening(createSession(config));

		expect(first.pending).toEqual(second.pending);
		expect(new Set(first.pending.map((trial) => trial.candidate.id)).size).toBe(
			5,
		);
		expect(first.pending).toHaveLength(20);
	});

	test("keeps broad candidates inside policy bounds", () => {
		for (const baselineCmPer360 of [5, 150]) {
			const state = enterScreening(
				createSession({ ...config, baselineCmPer360 }),
			);
			for (const trial of state.pending) {
				expect(trial.candidate.cmPer360).toBeGreaterThanOrEqual(
					calibrationPolicy.cmPer360.min,
				);
				expect(trial.candidate.cmPer360).toBeLessThanOrEqual(
					calibrationPolicy.cmPer360.max,
				);
			}
		}
	});

	test("repeats an invalid trial without advancing", () => {
		const state = createSession(config);
		const expected = pendingTrial(state);
		const next = recordTrial(state, invalidResult(expected));

		expect(next.stage).toBe("warmup");
		expect(next.invalidTrials).toBe(1);
		expect(next.pending[0]?.attempt).toBe(2);
		expect(next.completed).toHaveLength(0);
	});

	test("blocks results while paused and resumes the same trial", () => {
		const state = createSession(config);
		const paused = pauseSession(state);
		expect(paused.paused).toBe(true);
		expect(() =>
			recordTrial(paused, acceptedResult(pendingTrial(paused), 70)),
		).toThrow("Cannot record a trial while paused");

		const resumed = resumeSession(paused);
		expect(resumed.paused).toBe(false);
		expect(resumed.pending[0]).toEqual(state.pending[0]);
	});

	test("rejects out-of-band AI trials and accepts bounded ones", () => {
		const state = enterScreening(createSession(config));
		const rejected = offerAiTrial(state, {
			candidateCmPer360: 140,
			dimension: "tracking",
			durationMs: 18_000,
		});
		expect(rejected).toBe(state);

		const accepted = offerAiTrial(state, {
			candidateCmPer360: 42,
			dimension: "tracking",
			durationMs: 18_000,
		});
		expect(accepted.pending).toHaveLength(state.pending.length + 1);
		expect(accepted.pending[0]?.candidate.cmPer360).toBe(42);
	});

	test("reports low confidence when validation disagrees", () => {
		let state = createSession(config);
		while (state.stage !== "complete" && state.stage !== "abandoned") {
			const trial = pendingTrial(state);
			const preferredCm = state.stage === "validation" ? 52 : 34;
			const distance = Math.abs(trial.candidate.cmPer360 - preferredCm);
			state = recordTrial(state, acceptedResult(trial, 96 - distance * 3));
		}

		expect(state.result?.confidence.level).toBe("low");
		expect(state.result?.status).toBe("inconclusive");
		expect(state.result?.confidence.reasons).toContain(
			"Blind validation did not confirm the earlier leader",
		);
	});

	test("reports low confidence when candidates tie", () => {
		let state = createSession(config);
		while (state.stage !== "complete" && state.stage !== "abandoned") {
			state = recordTrial(state, acceptedResult(pendingTrial(state), 72));
		}

		expect(state.result?.confidence.level).toBe("low");
		expect(state.result?.confidence.reasons).toContain(
			"The leading sensitivities are too close to separate",
		);
	});

	test("reports low confidence when repeat performance is noisy", () => {
		let state = createSession(config);
		let index = 0;
		while (state.stage !== "complete" && state.stage !== "abandoned") {
			const trial = pendingTrial(state);
			const preferred = 95 - Math.abs(trial.candidate.cmPer360 - 34) * 2;
			const noise = index % 2 === 0 ? 18 : -18;
			state = recordTrial(state, acceptedResult(trial, preferred + noise));
			index += 1;
		}

		expect(state.result?.confidence.level).toBe("low");
		expect(state.result?.confidence.reasons).toContain(
			"Performance varied too much between trials",
		);
	});

	test("finishes with a bounded recommendation", () => {
		let state = createSession(config);
		while (state.stage !== "complete" && state.stage !== "abandoned") {
			const trial = pendingTrial(state);
			const score = 95 - Math.abs(trial.candidate.cmPer360 - 34) * 2;
			state = recordTrial(state, acceptedResult(trial, score));
		}

		expect(state.stage).toBe("complete");
		expect(state.result?.central.cmPer360).toBeGreaterThanOrEqual(28);
		expect(state.result?.central.cmPer360).toBeLessThanOrEqual(40);
		expect(state.result?.range.minCmPer360).toBeLessThanOrEqual(
			state.result?.range.maxCmPer360 ?? 0,
		);
	});
});

function enterScreening(initial: SessionState): SessionState {
	let state = initial;
	while (state.stage === "warmup" || state.stage === "baseline") {
		state = recordTrial(state, acceptedResult(pendingTrial(state), 70));
	}
	return state;
}
