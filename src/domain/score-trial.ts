import {
	type CalibrationPolicy,
	calibrationPolicy,
} from "./calibration-policy";
import type {
	ScoredTrial,
	ScoreParts,
	TrialObservation,
} from "./calibration-types";

export function scoreTrial(
	observation: TrialObservation,
	policy: CalibrationPolicy = calibrationPolicy,
): ScoredTrial {
	const issues = inspectObservation(observation, policy);
	if (issues.length > 0) return { accepted: false, observation, issues };

	const parts = measure(observation, policy);
	const weights = policy.dimensions[observation.dimension].weights;
	const score = sumParts(parts, weights) * 100;

	return {
		accepted: true,
		observation,
		parts,
		score: round(score),
	};
}

export function scoreTrials(
	observations: readonly TrialObservation[],
	policy: CalibrationPolicy = calibrationPolicy,
): readonly ScoredTrial[] {
	return observations.map((observation) => scoreTrial(observation, policy));
}

function measure(
	observation: TrialObservation,
	policy: CalibrationPolicy,
): ScoreParts {
	const settings = policy.dimensions[observation.dimension];

	switch (observation.dimension) {
		case "flicking":
			return {
				accuracy: ratio(observation.hits, observation.attempts),
				precision: inverseRatio(
					observation.meanErrorRatio,
					settings.errorLimitRatio,
				),
				speed: inverseRatio(
					observation.meanAcquisitionMs,
					settings.paceReferenceMs,
					true,
				),
				stability: inverseRatio(
					observation.acquisitionVariation,
					settings.variationLimit,
				),
			};
		case "tracking":
			return {
				accuracy: clamp(observation.onTargetRatio),
				precision: inverseRatio(
					observation.meanErrorRatio,
					settings.errorLimitRatio,
				),
				speed: clamp(observation.correctionEfficiency),
				stability: inverseRatio(
					observation.errorVariation,
					settings.variationLimit,
				),
			};
		case "target-switching":
			return {
				accuracy: ratio(observation.hits, observation.attempts),
				precision: inverseRatio(
					observation.meanErrorRatio,
					settings.errorLimitRatio,
				),
				speed: inverseRatio(
					observation.meanTransitionMs,
					settings.paceReferenceMs,
					true,
				),
				stability: inverseRatio(
					observation.transitionVariation,
					settings.variationLimit,
				),
			};
		case "micro-correction": {
			const correctionCost = Math.max(0, observation.meanCorrections - 1) / 3;
			return {
				accuracy: ratio(observation.hits, observation.attempts),
				precision: inverseRatio(
					observation.meanErrorRatio,
					settings.errorLimitRatio,
				),
				speed: inverseRatio(
					observation.meanSettleMs,
					settings.paceReferenceMs,
					true,
				),
				stability: clamp(1 - (correctionCost + observation.overshootRatio) / 2),
			};
		}
	}
}

function inspectObservation(
	observation: TrialObservation,
	policy: CalibrationPolicy,
): string[] {
	const issues: string[] = [];
	const finiteFields = Object.entries(observation).filter(
		(entry): entry is [string, number] => typeof entry[1] === "number",
	);

	for (const [name, value] of finiteFields) {
		if (!Number.isFinite(value)) issues.push(`${name} must be finite`);
	}

	if (!observation.id.trim()) issues.push("id is required");
	if (!observation.candidate.id.trim()) issues.push("candidate id is required");
	if (!Number.isFinite(observation.candidate.cmPer360))
		issues.push("candidate cmPer360 must be finite");
	if (observation.policyVersion !== policy.version)
		issues.push(`policy version must be ${policy.version}`);
	if (observation.durationMs <= 0) issues.push("durationMs must be positive");
	if (
		observation.candidate.cmPer360 < policy.cmPer360.min ||
		observation.candidate.cmPer360 > policy.cmPer360.max
	) {
		issues.push("candidate cmPer360 is outside policy bounds");
	}

	if (observation.dimension === "tracking") {
		if (observation.sampleCount < policy.minimumSamples.tracking)
			issues.push("tracking sample count is too low");
		if (!Number.isInteger(observation.sampleCount))
			issues.push("tracking sample count must be an integer");
		inspectUnitRatio("onTargetRatio", observation.onTargetRatio, issues);
		inspectUnitRatio(
			"correctionEfficiency",
			observation.correctionEfficiency,
			issues,
		);
		inspectNonNegative("meanErrorRatio", observation.meanErrorRatio, issues);
		inspectNonNegative("errorVariation", observation.errorVariation, issues);
		return issues;
	}

	if (observation.attempts < policy.minimumSamples.clicks)
		issues.push("attempt count is too low");
	if (!Number.isInteger(observation.attempts))
		issues.push("attempts must be an integer");
	if (!Number.isInteger(observation.hits))
		issues.push("hits must be an integer");
	if (observation.hits < 0 || observation.hits > observation.attempts)
		issues.push("hits must be between zero and attempts");
	inspectNonNegative("meanErrorRatio", observation.meanErrorRatio, issues);

	if (observation.dimension === "flicking") {
		inspectPositive("meanAcquisitionMs", observation.meanAcquisitionMs, issues);
		inspectNonNegative(
			"acquisitionVariation",
			observation.acquisitionVariation,
			issues,
		);
	}

	if (observation.dimension === "target-switching") {
		inspectPositive("meanTransitionMs", observation.meanTransitionMs, issues);
		inspectNonNegative(
			"transitionVariation",
			observation.transitionVariation,
			issues,
		);
	}

	if (observation.dimension === "micro-correction") {
		inspectPositive("meanSettleMs", observation.meanSettleMs, issues);
		inspectNonNegative("meanCorrections", observation.meanCorrections, issues);
		inspectUnitRatio("overshootRatio", observation.overshootRatio, issues);
	}

	return issues;
}

function sumParts(parts: ScoreParts, weights: ScoreParts): number {
	return (
		parts.accuracy * weights.accuracy +
		parts.precision * weights.precision +
		parts.speed * weights.speed +
		parts.stability * weights.stability
	);
}

function inverseRatio(value: number, limit: number, pace = false): number {
	if (pace) return clamp(limit / value);
	return clamp(1 - value / limit);
}

function ratio(part: number, total: number): number {
	return clamp(part / total);
}

function clamp(value: number): number {
	return Math.min(1, Math.max(0, value));
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}

function inspectPositive(name: string, value: number, issues: string[]): void {
	if (value <= 0) issues.push(`${name} must be positive`);
}

function inspectNonNegative(
	name: string,
	value: number,
	issues: string[],
): void {
	if (value < 0) issues.push(`${name} cannot be negative`);
}

function inspectUnitRatio(name: string, value: number, issues: string[]): void {
	if (value < 0 || value > 1)
		issues.push(`${name} must be between zero and one`);
}
