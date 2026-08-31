import type {
	AimDimension,
	Candidate,
	ComfortReport,
	InputMode,
	ScoredTrial,
} from "./calibration-types";

export const sessionStages = [
	"warmup",
	"baseline",
	"screening",
	"refinement",
	"validation",
	"complete",
	"abandoned",
] as const;

export type SessionStage = (typeof sessionStages)[number];

export type TrialSpec = {
	id: string;
	stage: Exclude<SessionStage, "complete" | "abandoned">;
	dimension: AimDimension;
	candidate: Candidate;
	durationMs: number;
	blindLabel: string | null;
	attempt: number;
};

export type CompletedTrial = {
	spec: TrialSpec;
	result: Extract<ScoredTrial, { accepted: true }>;
};

export type SessionConfig = {
	id: string;
	baselineCmPer360: number;
	inputMode: InputMode;
	seed: number;
};

export type SessionState = {
	config: SessionConfig;
	stage: SessionStage;
	paused: boolean;
	pending: readonly TrialSpec[];
	completed: readonly CompletedTrial[];
	invalidTrials: number;
	comfort: Readonly<Record<string, ComfortReport>>;
	leaderBeforeValidation: string | null;
	result: SessionResult | null;
};

export type CandidateSummary = {
	candidate: Candidate;
	overallScore: number;
	dimensions: Partial<Record<AimDimension, number>>;
	trialCount: number;
	variation: number;
	comfort: ComfortReport | null;
};

export type SessionConfidence = {
	level: "low" | "medium" | "high";
	reasons: readonly string[];
};

export type SessionResult = {
	status: "recommended" | "inconclusive";
	central: Candidate;
	range: {
		minCmPer360: number;
		maxCmPer360: number;
	};
	confidence: SessionConfidence;
	candidates: readonly CandidateSummary[];
};

export type AiTrialProposal = {
	candidateCmPer360: number;
	dimension: AimDimension;
	durationMs: number;
};
