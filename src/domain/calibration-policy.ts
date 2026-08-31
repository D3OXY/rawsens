import type { AimDimension, ScoreParts } from "./calibration-types";

export type DimensionPolicy = {
	weights: ScoreParts;
	paceReferenceMs: number;
	errorLimitRatio: number;
	variationLimit: number;
};

export type CalibrationPolicy = {
	version: string;
	cmPer360: {
		min: number;
		max: number;
	};
	minimumSamples: {
		clicks: number;
		tracking: number;
	};
	dimensions: Record<AimDimension, DimensionPolicy>;
};

export const calibrationPolicy = {
	version: "2026-08-23.1",
	cmPer360: {
		min: 5,
		max: 150,
	},
	minimumSamples: {
		clicks: 5,
		tracking: 60,
	},
	dimensions: {
		flicking: {
			weights: { accuracy: 0.35, precision: 0.3, speed: 0.25, stability: 0.1 },
			paceReferenceMs: 420,
			errorLimitRatio: 2,
			variationLimit: 0.65,
		},
		tracking: {
			weights: { accuracy: 0.4, precision: 0.3, speed: 0.1, stability: 0.2 },
			paceReferenceMs: 1,
			errorLimitRatio: 2,
			variationLimit: 0.75,
		},
		"target-switching": {
			weights: { accuracy: 0.3, precision: 0.2, speed: 0.35, stability: 0.15 },
			paceReferenceMs: 360,
			errorLimitRatio: 2,
			variationLimit: 0.65,
		},
		"micro-correction": {
			weights: { accuracy: 0.3, precision: 0.35, speed: 0.15, stability: 0.2 },
			paceReferenceMs: 520,
			errorLimitRatio: 1.5,
			variationLimit: 1,
		},
	},
} satisfies CalibrationPolicy;
