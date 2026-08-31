import { calibrationPolicy } from "../domain/calibration-policy";
import type { InputMode, TrialObservation } from "../domain/calibration-types";
import type { TrialSpec } from "../domain/session-types";
import { distance, type Point, type Target } from "./target-model";

export type PointerFrame = {
	atMs: number;
	pointer: Point;
	target: Target;
};

type ClickFrame = PointerFrame & {
	targetShownAtMs: number;
};

export class TrialRecorder {
	readonly #spec: TrialSpec;
	readonly #inputMode: InputMode;
	readonly #clicks: ClickFrame[] = [];
	readonly #samples: PointerFrame[] = [];
	readonly #moves: Point[] = [];
	readonly #corrections: number[] = [];
	#lastClickMoveIndex = 0;

	constructor(spec: TrialSpec, inputMode: InputMode) {
		this.#spec = spec;
		this.#inputMode = inputMode;
	}

	recordMove(delta: Point): void {
		this.#moves.push(delta);
	}

	recordSample(frame: PointerFrame): void {
		this.#samples.push(frame);
	}

	recordClick(frame: ClickFrame): void {
		this.#clicks.push(frame);
		this.#corrections.push(
			directionChanges(this.#moves.slice(this.#lastClickMoveIndex)),
		);
		this.#lastClickMoveIndex = this.#moves.length;
	}

	finish(): TrialObservation {
		const base = {
			id: this.#spec.id,
			candidate: this.#spec.candidate,
			durationMs: this.#spec.durationMs,
			inputMode: this.#inputMode,
			policyVersion: calibrationPolicy.version,
		};

		switch (this.#spec.dimension) {
			case "flicking":
				return {
					...base,
					dimension: "flicking",
					attempts: this.#clicks.length,
					hits: this.#clicks.filter(isHit).length,
					meanAcquisitionMs: mean(
						this.#clicks.map((click) => click.atMs - click.targetShownAtMs),
					),
					meanErrorRatio: mean(this.#clicks.map(errorRatio)),
					acquisitionVariation: coefficientOfVariation(
						this.#clicks.map((click) => click.atMs - click.targetShownAtMs),
					),
				};
			case "tracking":
				return {
					...base,
					dimension: "tracking",
					sampleCount: this.#samples.length,
					onTargetRatio: ratio(
						this.#samples.filter(isHit).length,
						this.#samples.length,
					),
					meanErrorRatio: mean(this.#samples.map(errorRatio)),
					errorVariation: coefficientOfVariation(this.#samples.map(errorRatio)),
					correctionEfficiency: correctionEfficiency(this.#samples),
				};
			case "target-switching":
				return {
					...base,
					dimension: "target-switching",
					attempts: this.#clicks.length,
					hits: this.#clicks.filter(isHit).length,
					meanTransitionMs: mean(
						this.#clicks.map((click) => click.atMs - click.targetShownAtMs),
					),
					meanErrorRatio: mean(this.#clicks.map(errorRatio)),
					transitionVariation: coefficientOfVariation(
						this.#clicks.map((click) => click.atMs - click.targetShownAtMs),
					),
				};
			case "micro-correction":
				return {
					...base,
					dimension: "micro-correction",
					attempts: this.#clicks.length,
					hits: this.#clicks.filter(isHit).length,
					meanSettleMs: mean(
						this.#clicks.map((click) => click.atMs - click.targetShownAtMs),
					),
					meanErrorRatio: mean(this.#clicks.map(errorRatio)),
					meanCorrections: mean(
						this.#corrections.map((changes) => changes + 1),
					),
					overshootRatio: ratio(
						this.#corrections.filter((changes) => changes > 0).length,
						this.#corrections.length,
					),
				};
		}
	}
}

function isHit(frame: PointerFrame): boolean {
	return distance(frame.pointer, frame.target) <= frame.target.radius;
}

function errorRatio(frame: PointerFrame): number {
	return distance(frame.pointer, frame.target) / frame.target.radius;
}

function correctionEfficiency(samples: readonly PointerFrame[]): number {
	if (samples.length < 2) return 0;
	let useful = 0;
	let total = 0;
	for (let index = 1; index < samples.length; index += 1) {
		const before = samples[index - 1];
		const after = samples[index];
		if (!before || !after) continue;
		const change =
			distance(before.pointer, before.target) -
			distance(after.pointer, after.target);
		useful += Math.max(0, change);
		total += distance(before.pointer, after.pointer);
	}
	return Math.min(1, ratio(useful, total));
}

function directionChanges(moves: readonly Point[]): number {
	let changes = 0;
	for (let index = 1; index < moves.length; index += 1) {
		const before = moves[index - 1];
		const current = moves[index];
		if (!before || !current) continue;
		if (Math.sign(before.x) !== Math.sign(current.x)) changes += 1;
		if (Math.sign(before.y) !== Math.sign(current.y)) changes += 1;
	}
	return changes;
}

function mean(values: readonly number[]): number {
	if (values.length === 0) return 0;
	return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function coefficientOfVariation(values: readonly number[]): number {
	if (values.length < 2) return 0;
	const average = mean(values);
	if (average === 0) return 0;
	const variance = mean(values.map((value) => (value - average) ** 2));
	return Math.sqrt(variance) / average;
}

function ratio(part: number, total: number): number {
	if (total <= 0) return 0;
	return part / total;
}
