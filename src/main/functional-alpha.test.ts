import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	pauseSession,
	recordTrial,
	resumeSession,
	setComfort,
} from "../domain/session-controller";
import {
	acceptedResult,
	invalidResult,
	pendingTrial,
} from "../domain/session-test-fixtures";
import type { SessionState } from "../domain/session-types";
import type { StoredSession } from "../shared/local-data";
import { createProfileAndSession } from "../ui/app-flow";
import { LocalRepository } from "./local-repository";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("functional alpha", () => {
	test("finishes and restores a native-relative adaptive session", async () => {
		const sourceDirectory = await temporaryDirectory();
		const repository = await LocalRepository.open(sourceDirectory);
		const created = createProfileAndSession(
			{
				profileName: "Apple Silicon setup",
				gameId: "counter-strike-2",
				dpi: 800,
				baselineCmPer360: 40,
				inputMode: "native-relative",
			},
			{
				profileId: "profile-alpha",
				sessionId: "session-alpha",
				now: "2026-08-23T12:00:00.000Z",
				seed: 9182,
			},
		);
		await repository.upsertProfile(created.profile);
		await repository.saveSession(created.session);

		let state = created.session.state;
		const first = pendingTrial(state);
		state = recordTrial(state, invalidResult(first, "native-relative"));
		expect(state.pending[0]?.attempt).toBe(2);
		state = await finishProtocol(
			repository,
			sourceDirectory,
			created.session,
			state,
		);

		expect(state.stage).toBe("complete");
		expect(state.result?.status).toBe("recommended");
		expect(state.result?.confidence.level).not.toBe("low");
		expect(
			new Set(state.completed.map((trial) => trial.spec.dimension)),
		).toEqual(
			new Set(["flicking", "tracking", "target-switching", "micro-correction"]),
		);
		expect(
			state.completed
				.filter((trial) => trial.spec.stage === "validation")
				.every((trial) => trial.spec.blindLabel !== null),
		).toBe(true);
		expect(stageSpread(state, "refinement")).toBeLessThan(
			stageSpread(state, "screening"),
		);
		expect(state.invalidTrials).toBe(1);

		const resultCm = state.result?.central.cmPer360;
		if (!resultCm) throw new Error("Protocol completed without a result");
		await repository.upsertProfile({
			...created.profile,
			lastCmPer360: resultCm,
			updatedAt: "2026-08-23T13:00:00.000Z",
		});

		const target = await LocalRepository.open(await temporaryDirectory());
		await target.importJson(repository.exportJson());
		expect(target.getSnapshot()).toEqual(repository.getSnapshot());
		expect(target.getSnapshot().profiles[0]?.lastCmPer360).toBe(resultCm);
		expect(target.getSnapshot().sessions[0]?.state.stage).toBe("complete");
	});
});

function stageSpread(
	state: SessionState,
	stage: "screening" | "refinement",
): number {
	const values = state.completed
		.filter((trial) => trial.spec.stage === stage)
		.map((trial) => trial.spec.candidate.cmPer360);
	return Math.max(...values) - Math.min(...values);
}

async function finishProtocol(
	repository: LocalRepository,
	directory: string,
	session: StoredSession,
	initial: SessionState,
): Promise<SessionState> {
	let state = initial;
	let restarted = false;
	while (state.stage !== "complete" && state.stage !== "abandoned") {
		if (!restarted && state.completed.length >= 10) {
			const paused = pauseSession(state);
			await save(repository, session, paused);
			const nextTrialId = paused.pending[0]?.id;
			const reopened = await LocalRepository.open(directory);
			const restored = reopened.getSnapshot().sessions[0]?.state;
			if (!restored) throw new Error("Restart lost the active session");
			expect(restored.paused).toBe(true);
			expect(restored.pending[0]?.id).toBe(nextTrialId);
			state = resumeSession(restored);
			restarted = true;
		}

		const trial = pendingTrial(state);
		const score = 95 - Math.abs(trial.candidate.cmPer360 - 34) * 2;
		state = recordTrial(state, acceptedResult(trial, score, "native-relative"));
		state = setComfort(state, trial.candidate.id, {
			comfort: 0.8,
			fatigue: 0.2,
			shakiness: 0.2,
			control: 0.8,
		});
		await save(repository, session, state);
	}
	return state;
}

async function save(
	repository: LocalRepository,
	session: StoredSession,
	state: SessionState,
): Promise<void> {
	await repository.saveSession({
		...session,
		state,
		updatedAt: "2026-08-23T13:00:00.000Z",
	});
}

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rawsens-alpha-"));
	temporaryDirectories.push(directory);
	return directory;
}
