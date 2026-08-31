import { describe, expect, test } from "bun:test";
import { staticTarget, trackingTarget } from "./target-model";

const arena = { width: 1_000, height: 700 };

describe("target model", () => {
	test("replays static targets from a seed", () => {
		const first = Array.from({ length: 12 }, (_, index) =>
			staticTarget("flicking", 42, index, arena),
		);
		const second = Array.from({ length: 12 }, (_, index) =>
			staticTarget("flicking", 42, index, arena),
		);
		expect(first).toEqual(second);
	});

	test("keeps targets inside small arenas", () => {
		const small = { width: 240, height: 180 };
		for (let index = 0; index < 20; index += 1) {
			const target = staticTarget("micro-correction", 71, index, small, {
				x: 120,
				y: 90,
			});
			expect(target.x - target.radius).toBeGreaterThan(0);
			expect(target.x + target.radius).toBeLessThan(small.width);
			expect(target.y - target.radius).toBeGreaterThan(0);
			expect(target.y + target.radius).toBeLessThan(small.height);
		}
	});

	test("moves tracking targets over time without leaving the arena", () => {
		const start = trackingTarget(9, 0, arena);
		const later = trackingTarget(9, 1_000, arena);
		expect(later).not.toEqual(start);
		for (const target of [start, later]) {
			expect(target.x - target.radius).toBeGreaterThan(0);
			expect(target.x + target.radius).toBeLessThan(arena.width);
			expect(target.y - target.radius).toBeGreaterThan(0);
			expect(target.y + target.radius).toBeLessThan(arena.height);
		}
	});
});
