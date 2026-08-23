export const aimDimensions = [
	"flicking",
	"tracking",
	"target-switching",
	"micro-correction",
] as const;

export type AimDimension = (typeof aimDimensions)[number];

export const inputModes = [
	"hardware-raw",
	"native-relative",
	"compatibility-relative",
] as const;

export type InputMode = (typeof inputModes)[number];

export type Candidate = {
	id: string;
	cmPer360: number;
};

type TrialBase = {
	id: string;
	candidate: Candidate;
	durationMs: number;
	inputMode: InputMode;
	policyVersion: string;
};

export type FlickObservation = TrialBase & {
	dimension: "flicking";
	attempts: number;
	hits: number;
	meanAcquisitionMs: number;
	meanErrorRatio: number;
	acquisitionVariation: number;
};

export type TrackingObservation = TrialBase & {
	dimension: "tracking";
	sampleCount: number;
	onTargetRatio: number;
	meanErrorRatio: number;
	errorVariation: number;
	correctionEfficiency: number;
};

export type SwitchingObservation = TrialBase & {
	dimension: "target-switching";
	attempts: number;
	hits: number;
	meanTransitionMs: number;
	meanErrorRatio: number;
	transitionVariation: number;
};

export type MicroObservation = TrialBase & {
	dimension: "micro-correction";
	attempts: number;
	hits: number;
	meanSettleMs: number;
	meanErrorRatio: number;
	meanCorrections: number;
	overshootRatio: number;
};

export type TrialObservation =
	| FlickObservation
	| TrackingObservation
	| SwitchingObservation
	| MicroObservation;

export type ScoreParts = {
	accuracy: number;
	precision: number;
	speed: number;
	stability: number;
};

export type ScoredTrial =
	| {
			accepted: true;
			observation: TrialObservation;
			parts: ScoreParts;
			score: number;
	  }
	| {
			accepted: false;
			observation: TrialObservation;
			issues: readonly string[];
	  };

export type ComfortReport = {
	comfort: number;
	fatigue: number;
	shakiness: number;
	control: number;
};
