import type { AimDimension } from "../domain/calibration-types";

export const dimensionLabels: Record<AimDimension, string> = {
	flicking: "Flicking",
	tracking: "Tracking",
	"target-switching": "Switching",
	"micro-correction": "Micro",
};
