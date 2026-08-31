import { calibrationPolicy } from "./calibration-policy";
import type {
	InputMode,
	ScoredTrial,
	TrialObservation,
} from "./calibration-types";
import type { SessionState, TrialSpec } from "./session-types";

export function pendingTrial(state: SessionState): TrialSpec {
	const trial = state.pending[0];
	if (!trial) throw new Error(`No pending trial in ${state.stage}`);
	return trial;
}

export function acceptedResult(
	trial: TrialSpec,
	score: number,
	inputMode: InputMode = "hardware-raw",
): Extract<ScoredTrial, { accepted: true }> {
	return {
		accepted: true,
		observation: observationFor(trial, inputMode),
		parts: {
			accuracy: score / 100,
			precision: score / 100,
			speed: score / 100,
			stability: score / 100,
		},
		score,
	};
}

export function invalidResult(
	trial: TrialSpec,
	inputMode: InputMode = "hardware-raw",
): Extract<ScoredTrial, { accepted: false }> {
	return {
		accepted: false,
		observation: observationFor(trial, inputMode),
		issues: ["capture lost"],
	};
}

function observationFor(
	trial: TrialSpec,
	inputMode: InputMode,
): TrialObservation {
	const base = {
		id: trial.id,
		candidate: trial.candidate,
		durationMs: trial.durationMs,
		inputMode,
		policyVersion: calibrationPolicy.version,
	};

	switch (trial.dimension) {
		case "flicking":
			return {
				...base,
				dimension: "flicking",
				attempts: 10,
				hits: 8,
				meanAcquisitionMs: 400,
				meanErrorRatio: 0.2,
				acquisitionVariation: 0.2,
			};
		case "tracking":
			return {
				...base,
				dimension: "tracking",
				sampleCount: 120,
				onTargetRatio: 0.8,
				meanErrorRatio: 0.2,
				errorVariation: 0.2,
				correctionEfficiency: 0.8,
			};
		case "target-switching":
			return {
				...base,
				dimension: "target-switching",
				attempts: 10,
				hits: 8,
				meanTransitionMs: 400,
				meanErrorRatio: 0.2,
				transitionVariation: 0.2,
			};
		case "micro-correction":
			return {
				...base,
				dimension: "micro-correction",
				attempts: 10,
				hits: 8,
				meanSettleMs: 500,
				meanErrorRatio: 0.2,
				meanCorrections: 1.2,
				overshootRatio: 0.1,
			};
	}
}
