import { describe, expect, test } from "bun:test";
import type { LocalData, StoredSession } from "../shared/local-data";
import {
	createProfileAndSession,
	historyEntries,
	sessionProgress,
} from "./app-flow";

const now = "2026-08-23T00:00:00.000Z";

describe("app flow", () => {
	test("creates a recoverable profile and deterministic session", () => {
		const created = createProfileAndSession(
			{
				profileName: "Main",
				gameId: "valorant",
				dpi: 800,
				baselineCmPer360: 40,
				inputMode: "hardware-raw",
			},
			{ profileId: "profile-1", sessionId: "session-1", now, seed: 42 },
		);
		expect(created.profile).toMatchObject({ dpi: 800, lastCmPer360: 40 });
		expect(created.session).toMatchObject({
			id: "session-1",
			profileId: "profile-1",
			state: { stage: "warmup", config: { inputMode: "hardware-raw" } },
		});
		expect(sessionProgress(created.session.state)).toBe(0);
	});

	test("rejects values outside calibration and profile bounds", () => {
		expect(() =>
			createProfileAndSession(
				{
					profileName: "",
					gameId: "valorant",
					dpi: 50,
					baselineCmPer360: 200,
					inputMode: "compatibility-relative",
				},
				{ profileId: "profile", sessionId: "session", now, seed: 1 },
			),
		).toThrow("Profile name");
	});

	test("builds newest-first history with same-profile deltas", () => {
		const first = completedSession("first", "2026-08-20T00:00:00.000Z", 40);
		const second = completedSession("second", "2026-08-22T00:00:00.000Z", 42);
		const data: LocalData = {
			schemaVersion: 1,
			settings: {
				theme: "system",
				updatePolicy: "notify",
				defaultProfileId: "profile-1",
				ai: {
					enabled: false,
					access: "free-proxy",
					modelId: "stealth/ox-alpha",
					disclosureAcceptedAt: null,
				},
			},
			profiles: [
				{
					id: "profile-1",
					name: "Main",
					dpi: 800,
					gameId: "valorant",
					lastCmPer360: 42,
					createdAt: now,
					updatedAt: now,
				},
			],
			sessions: [first, second],
		};
		const history = historyEntries(data);
		expect(history.map((entry) => entry.session.id)).toEqual([
			"second",
			"first",
		]);
		expect(history[0]?.deltaFromPrevious).toBe(2);
		expect(history[1]?.deltaFromPrevious).toBeNull();
	});
});

function completedSession(
	id: string,
	createdAt: string,
	centralCmPer360: number,
): StoredSession {
	const { session } = createProfileAndSession(
		{
			profileName: "Main",
			gameId: "valorant",
			dpi: 800,
			baselineCmPer360: 40,
			inputMode: "hardware-raw",
		},
		{ profileId: "profile-1", sessionId: id, now: createdAt, seed: 1 },
	);
	return {
		...session,
		state: {
			...session.state,
			stage: "complete",
			pending: [],
			result: {
				status: "recommended",
				central: { id: `cm-${centralCmPer360}`, cmPer360: centralCmPer360 },
				range: {
					minCmPer360: centralCmPer360 - 2,
					maxCmPer360: centralCmPer360 + 2,
				},
				confidence: { level: "high", reasons: ["Stable validation"] },
				candidates: [],
			},
		},
	};
}
