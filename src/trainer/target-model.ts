import type { AimDimension } from "../domain/calibration-types";

export type Point = {
	x: number;
	y: number;
};

export type ArenaSize = {
	width: number;
	height: number;
};

export type Target = Point & {
	radius: number;
};

const targetRadius: Record<AimDimension, number> = {
	flicking: 28,
	tracking: 34,
	"target-switching": 26,
	"micro-correction": 18,
};

export function staticTarget(
	dimension: Exclude<AimDimension, "tracking">,
	seed: number,
	index: number,
	arena: ArenaSize,
	anchor?: Point,
): Target {
	const radius = targetRadius[dimension];
	const padding = radius + 28;
	const randomX = random(seed, index * 2);
	const randomY = random(seed, index * 2 + 1);

	if (dimension === "micro-correction" && anchor) {
		const angle = randomX * Math.PI * 2;
		const distance = 55 + randomY * 90;
		return keepInside(
			{
				x: anchor.x + Math.cos(angle) * distance,
				y: anchor.y + Math.sin(angle) * distance,
				radius,
			},
			arena,
			padding,
		);
	}

	if (dimension === "target-switching") {
		const side = index % 2 === 0 ? 0.18 : 0.82;
		return {
			x: arena.width * side,
			y: padding + randomY * Math.max(1, arena.height - padding * 2),
			radius,
		};
	}

	return {
		x: padding + randomX * Math.max(1, arena.width - padding * 2),
		y: padding + randomY * Math.max(1, arena.height - padding * 2),
		radius,
	};
}

export function trackingTarget(
	seed: number,
	elapsedMs: number,
	arena: ArenaSize,
): Target {
	const radius = targetRadius.tracking;
	const phase = random(seed, 0) * Math.PI * 2;
	const xRange = Math.max(0, arena.width / 2 - radius - 42);
	const yRange = Math.max(0, arena.height / 2 - radius - 42);
	const seconds = elapsedMs / 1_000;

	return {
		x: arena.width / 2 + Math.sin(seconds * 1.15 + phase) * xRange * 0.72,
		y:
			arena.height / 2 +
			Math.sin(seconds * 1.73 + phase * 0.61) * yRange * 0.48,
		radius,
	};
}

export function distance(left: Point, right: Point): number {
	return Math.hypot(left.x - right.x, left.y - right.y);
}

function keepInside(target: Target, arena: ArenaSize, padding: number): Target {
	return {
		...target,
		x: Math.min(arena.width - padding, Math.max(padding, target.x)),
		y: Math.min(arena.height - padding, Math.max(padding, target.y)),
	};
}

function random(seed: number, index: number): number {
	let value = (seed + Math.imul(index + 1, 0x9e3779b1)) >>> 0;
	value ^= value >>> 16;
	value = Math.imul(value, 0x21f0aaad);
	value ^= value >>> 15;
	value = Math.imul(value, 0x735a2d97);
	value ^= value >>> 15;
	return (value >>> 0) / 4_294_967_296;
}
