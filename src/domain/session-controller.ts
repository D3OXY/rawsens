import { calibrationPolicy } from "./calibration-policy";
import {
	aimDimensions,
	type Candidate,
	type ComfortReport,
	type ScoredTrial,
} from "./calibration-types";
import type {
	AiTrialProposal,
	CandidateSummary,
	CompletedTrial,
	SessionConfidence,
	SessionConfig,
	SessionResult,
	SessionState,
	TrialSpec,
} from "./session-types";

const stageDuration: Record<TrialSpec["stage"], number> = {
	warmup: 10_000,
	baseline: 18_000,
	screening: 18_000,
	refinement: 22_000,
	validation: 24_000,
};

export function createSession(config: SessionConfig): SessionState {
	assertSessionConfig(config);
	const baseline = candidate(config.baselineCmPer360);

	return {
		config,
		stage: "warmup",
		paused: false,
		pending: makeTrials("warmup", [baseline], config.seed),
		completed: [],
		invalidTrials: 0,
		comfort: {},
		leaderBeforeValidation: null,
		result: null,
	};
}

export function recordTrial(
	state: SessionState,
	result: ScoredTrial,
): SessionState {
	if (state.paused) throw new Error("Cannot record a trial while paused");
	const expected = state.pending[0];
	if (!expected) throw new Error("Session has no pending trial");
	assertExpectedTrial(expected, result);

	if (!result.accepted) {
		const retry = {
			...expected,
			id: `${expected.id}-retry-${expected.attempt + 1}`,
			attempt: expected.attempt + 1,
		};
		return {
			...state,
			pending: [retry, ...state.pending.slice(1)],
			invalidTrials: state.invalidTrials + 1,
		};
	}

	const completed = [...state.completed, { spec: expected, result }];
	const next = { ...state, pending: state.pending.slice(1), completed };
	return next.pending.length > 0 ? next : moveToNextStage(next);
}

export function setComfort(
	state: SessionState,
	candidateId: string,
	report: ComfortReport,
): SessionState {
	for (const [name, value] of Object.entries(report)) {
		if (!Number.isFinite(value) || value < 0 || value > 1)
			throw new RangeError(`${name} must be between zero and one`);
	}

	return {
		...state,
		comfort: { ...state.comfort, [candidateId]: report },
	};
}

export function offerAiTrial(
	state: SessionState,
	proposal: AiTrialProposal,
): SessionState {
	if (state.stage !== "screening" && state.stage !== "refinement") return state;
	if (!aimDimensions.includes(proposal.dimension)) return state;
	if (!Number.isFinite(proposal.candidateCmPer360)) return state;
	if (proposal.durationMs < 8_000 || proposal.durationMs > 30_000) return state;

	const currentValues = state.pending.map((trial) => trial.candidate.cmPer360);
	if (currentValues.length === 0) return state;
	const min = Math.min(...currentValues);
	const max = Math.max(...currentValues);
	if (proposal.candidateCmPer360 < min || proposal.candidateCmPer360 > max)
		return state;

	const proposedCandidate = candidate(proposal.candidateCmPer360);
	const trial: TrialSpec = {
		id: `${state.stage}-ai-${state.completed.length}-${state.pending.length}-${proposedCandidate.id}-${proposal.dimension}`,
		stage: state.stage,
		dimension: proposal.dimension,
		candidate: proposedCandidate,
		durationMs: proposal.durationMs,
		blindLabel: null,
		attempt: 1,
	};

	return { ...state, pending: [trial, ...state.pending] };
}

export function pauseSession(state: SessionState): SessionState {
	if (state.stage === "complete" || state.stage === "abandoned") return state;
	return { ...state, paused: true };
}

export function resumeSession(state: SessionState): SessionState {
	if (state.stage === "complete" || state.stage === "abandoned") return state;
	return { ...state, paused: false };
}

export function abandonSession(state: SessionState): SessionState {
	if (state.stage === "complete") return state;
	return {
		...state,
		stage: "abandoned",
		paused: false,
		pending: [],
		result: null,
	};
}

function moveToNextStage(state: SessionState): SessionState {
	switch (state.stage) {
		case "warmup":
			return startStage(state, "baseline", [
				candidate(state.config.baselineCmPer360),
			]);
		case "baseline":
			return startStage(
				state,
				"screening",
				broadCandidates(state.config.baselineCmPer360),
			);
		case "screening": {
			const leaders = rankCandidates(state.completed, ["screening"]);
			return startStage(
				state,
				"refinement",
				refinementCandidates(leaders, state.config.baselineCmPer360),
			);
		}
		case "refinement": {
			const leaders = rankCandidates(state.completed, [
				"screening",
				"refinement",
			]);
			const validation = validationCandidates(
				leaders,
				state.config.baselineCmPer360,
			);
			return {
				...startStage(state, "validation", validation, true),
				leaderBeforeValidation: leaders[0]?.candidate.id ?? null,
			};
		}
		case "validation":
			return {
				...state,
				stage: "complete",
				pending: [],
				result: buildResult(state),
			};
		case "complete":
		case "abandoned":
			return state;
	}
}

function startStage(
	state: SessionState,
	stage: TrialSpec["stage"],
	candidates: readonly Candidate[],
	blind = false,
): SessionState {
	return {
		...state,
		stage,
		pending: makeTrials(
			stage,
			candidates,
			state.config.seed + state.completed.length,
			blind,
		),
	};
}

function makeTrials(
	stage: TrialSpec["stage"],
	candidates: readonly Candidate[],
	seed: number,
	blind = false,
): TrialSpec[] {
	const trials = candidates.flatMap((entry, candidateIndex) =>
		aimDimensions.map((dimension, dimensionIndex) => ({
			id: `${stage}-${entry.id}-${dimension}`,
			stage,
			dimension,
			candidate: entry,
			durationMs: stageDuration[stage],
			blindLabel: blind ? `Option ${candidateIndex + 1}` : null,
			attempt: 1,
			order: candidateIndex * aimDimensions.length + dimensionIndex,
		})),
	);

	return shuffle(trials, seed).map(({ order: _order, ...trial }) => trial);
}

function broadCandidates(baseline: number): Candidate[] {
	return uniqueCandidates(
		[0.7, 0.85, 1, 1.15, 1.3].map((factor) => baseline * factor),
	);
}

function refinementCandidates(
	leaders: readonly CandidateSummary[],
	baseline: number,
): Candidate[] {
	const top = leaders.slice(0, 2).map((entry) => entry.candidate.cmPer360);
	if (top.length < 2)
		return uniqueCandidates([baseline * 0.925, baseline, baseline * 1.075]);

	const low = Math.min(...top);
	const high = Math.max(...top);
	return uniqueCandidates([low, (low + high) / 2, high]);
}

function validationCandidates(
	leaders: readonly CandidateSummary[],
	baseline: number,
): Candidate[] {
	const values = [
		baseline,
		...leaders.slice(0, 2).map((entry) => entry.candidate.cmPer360),
	];
	return uniqueCandidates(values);
}

function buildResult(state: SessionState): SessionResult {
	const ranked = rankCandidates(state.completed, [
		"screening",
		"refinement",
		"validation",
	]);
	const summaries = ranked.map((summary) => ({
		...summary,
		comfort: state.comfort[summary.candidate.id] ?? null,
	}));
	const central =
		summaries[0] ?? rankCandidates(state.completed, ["baseline"])[0];
	if (!central) throw new Error("Session completed without scored candidates");

	const close = summaries.filter(
		(entry) => central.overallScore - entry.overallScore <= 3,
	);
	const rangeValues = (close.length > 0 ? close : [central]).map(
		(entry) => entry.candidate.cmPer360,
	);
	const confidence = assessConfidence(state, summaries);

	return {
		status: confidence.level === "low" ? "inconclusive" : "recommended",
		central: central.candidate,
		range: {
			minCmPer360: Math.min(...rangeValues),
			maxCmPer360: Math.max(...rangeValues),
		},
		confidence,
		candidates: summaries,
	};
}

function assessConfidence(
	state: SessionState,
	summaries: readonly CandidateSummary[],
): SessionConfidence {
	const reasons: string[] = [];
	const first = summaries[0];
	const second = summaries[1];
	const enoughTrials = Boolean(first && first.trialCount >= 8);
	const repeatable = Boolean(first && first.variation <= 8);
	const separated = Boolean(
		first && second && first.overallScore - second.overallScore >= 2,
	);

	if (!enoughTrials)
		reasons.push("The leading sensitivity has too few repeated trials");

	if (!repeatable) reasons.push("Performance varied too much between trials");

	if (!separated)
		reasons.push("The leading sensitivities are too close to separate");

	const validationLeader = rankCandidates(state.completed, ["validation"])[0];
	const confirmed =
		validationLeader?.candidate.id === state.leaderBeforeValidation;
	if (!confirmed)
		reasons.push("Blind validation did not confirm the earlier leader");

	if (state.invalidTrials > 2)
		reasons.push("Several trials were invalid and repeated");

	if (
		enoughTrials &&
		repeatable &&
		separated &&
		confirmed &&
		state.invalidTrials <= 2
	)
		return {
			level: "high",
			reasons: ["Repeated blind trials confirmed a clear leader"],
		};
	if (separated && confirmed && (enoughTrials || repeatable))
		return { level: "medium", reasons };
	return { level: "low", reasons };
}

function rankCandidates(
	completed: readonly CompletedTrial[],
	stages: readonly TrialSpec["stage"][],
): CandidateSummary[] {
	const groups = new Map<string, CompletedTrial[]>();
	for (const trial of completed) {
		if (!stages.includes(trial.spec.stage)) continue;
		const group = groups.get(trial.spec.candidate.id) ?? [];
		group.push(trial);
		groups.set(trial.spec.candidate.id, group);
	}

	return [...groups.values()]
		.map(summarizeCandidate)
		.sort(
			(left, right) =>
				right.overallScore - left.overallScore ||
				left.candidate.cmPer360 - right.candidate.cmPer360,
		);
}

function summarizeCandidate(
	trials: readonly CompletedTrial[],
): CandidateSummary {
	const first = trials[0];
	if (!first) throw new Error("Cannot summarize an empty candidate");
	const scores = trials.map((trial) => trial.result.score);
	const dimensions: Partial<Record<(typeof aimDimensions)[number], number>> =
		{};
	for (const dimension of aimDimensions) {
		const values = trials
			.filter((trial) => trial.spec.dimension === dimension)
			.map((trial) => trial.result.score);
		if (values.length > 0) dimensions[dimension] = mean(values);
	}

	return {
		candidate: first.spec.candidate,
		overallScore: round(mean(scores)),
		dimensions,
		trialCount: trials.length,
		variation: round(
			mean(
				aimDimensions.map((dimension) =>
					standardDeviation(
						trials
							.filter((trial) => trial.spec.dimension === dimension)
							.map((trial) => trial.result.score),
					),
				),
			),
		),
		comfort: null,
	};
}

function uniqueCandidates(values: readonly number[]): Candidate[] {
	const byId = new Map<string, Candidate>();
	for (const value of values) {
		const entry = candidate(value);
		byId.set(entry.id, entry);
	}
	return [...byId.values()].sort(
		(left, right) => left.cmPer360 - right.cmPer360,
	);
}

function candidate(cmPer360: number): Candidate {
	const bounded = Math.min(
		calibrationPolicy.cmPer360.max,
		Math.max(calibrationPolicy.cmPer360.min, cmPer360),
	);
	const rounded = Math.round(bounded * 100) / 100;
	return {
		id: `sens-${rounded.toFixed(2).replace(".", "_")}`,
		cmPer360: rounded,
	};
}

function shuffle<T extends { order: number }>(
	items: readonly T[],
	seed: number,
): T[] {
	const result = [...items];
	let state = seed >>> 0;
	for (let index = result.length - 1; index > 0; index -= 1) {
		state += 0x6d2b79f5;
		let value = state;
		value = Math.imul(value ^ (value >>> 15), value | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		const random = ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
		const swapIndex = Math.floor(random * (index + 1));
		const current = result[index];
		const swapped = result[swapIndex];
		if (current === undefined || swapped === undefined) continue;
		result[index] = swapped;
		result[swapIndex] = current;
	}
	return result;
}

function assertSessionConfig(config: SessionConfig): void {
	if (!config.id.trim()) throw new Error("Session id is required");
	if (!Number.isInteger(config.seed))
		throw new Error("Session seed must be an integer");
	if (
		!Number.isFinite(config.baselineCmPer360) ||
		config.baselineCmPer360 < calibrationPolicy.cmPer360.min ||
		config.baselineCmPer360 > calibrationPolicy.cmPer360.max
	) {
		throw new RangeError("Baseline sensitivity is outside policy bounds");
	}
}

function assertExpectedTrial(expected: TrialSpec, result: ScoredTrial): void {
	const observation = result.observation;
	if (
		observation.id !== expected.id ||
		observation.candidate.id !== expected.candidate.id ||
		observation.dimension !== expected.dimension
	) {
		throw new Error("Trial result does not match the pending trial");
	}
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function standardDeviation(values: readonly number[]): number {
	if (values.length < 2) return 0;
	const average = mean(values);
	const variance = mean(values.map((value) => (value - average) ** 2));
	return Math.sqrt(variance);
}

function round(value: number): number {
	return Math.round(value * 100) / 100;
}
