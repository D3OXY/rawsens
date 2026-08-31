import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	exportLocalData,
	importLocalData,
	type LocalData,
	type Profile,
	type StoredSession,
} from "../shared/local-data";
import { LocalRepository } from "./local-repository";

const temporaryDirectories: string[] = [];
const timestamp = "2026-08-23T12:00:00.000Z";

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("LocalRepository", () => {
	test("restores profiles and in-progress session history after restart", async () => {
		const directory = await temporaryDirectory();
		const repository = await LocalRepository.open(directory);
		await repository.upsertProfile(profile);
		await repository.saveSession(session);

		const reopened = await LocalRepository.open(directory);
		expect(reopened.getSnapshot().profiles).toEqual([profile]);
		expect(reopened.getSnapshot().sessions).toEqual([session]);
		expect(
			reopened.getSnapshot().sessions[0]?.state.completed[0]?.result
				.observation,
		).toMatchObject({
			inputMode: "native-relative",
			policyVersion: "1.0.0",
		});
	});

	test("round-trips portable history and rejects bad imports without overwrite", async () => {
		const sourceDirectory = await temporaryDirectory();
		const source = await LocalRepository.open(sourceDirectory);
		await source.upsertProfile(profile);
		await source.saveSession(session);
		const exported = source.exportJson();

		const targetDirectory = await temporaryDirectory();
		const target = await LocalRepository.open(targetDirectory);
		await target.importJson(exported);
		expect(target.getSnapshot()).toEqual(source.getSnapshot());

		const before = target.getSnapshot();
		await expect(
			target.importJson('{"schemaVersion":99,"settings":{}}'),
		).rejects.toThrow("schema version 99");
		await expect(target.importJson("not json")).rejects.toThrow();
		expect(target.getSnapshot()).toEqual(before);
		expect((await LocalRepository.open(targetDirectory)).getSnapshot()).toEqual(
			before,
		);
	});

	test("recovers the last readable state after corruption", async () => {
		const directory = await temporaryDirectory();
		const repository = await LocalRepository.open(directory);
		await repository.upsertProfile(profile);
		await repository.updateSettings({
			...repository.getSnapshot().settings,
			theme: "dark",
		});
		await writeFile(join(directory, "data.json"), "truncated", "utf8");
		await writeFile(
			join(directory, "data.json.tmp-interrupted"),
			"partial",
			"utf8",
		);

		const recovered = await LocalRepository.open(directory);
		expect(recovered.getSnapshot().profiles).toEqual([profile]);
		expect(recovered.getSnapshot().settings.theme).toBe("system");
		expect((await LocalRepository.open(directory)).getSnapshot()).toEqual(
			recovered.getSnapshot(),
		);
	});

	test("serializes concurrent updates without losing data", async () => {
		const repository = await LocalRepository.open(await temporaryDirectory());
		await Promise.all([
			repository.upsertProfile(profile),
			repository.upsertProfile({
				...profile,
				id: "profile-2",
				name: "Tactical",
			}),
		]);
		expect(repository.getSnapshot().profiles.map(({ id }) => id)).toEqual([
			"profile-1",
			"profile-2",
		]);
	});
});

describe("portable local data", () => {
	test("migrates schema version zero", () => {
		const migrated = importLocalData(
			JSON.stringify({
				schemaVersion: 0,
				settings: {
					theme: "dark",
					updatePolicy: "notify",
					defaultProfileId: "profile-1",
					aiEnabled: true,
					aiModelId: "stealth/ox-alpha",
				},
				profiles: [profile],
				sessions: [session],
			}),
		);
		expect(migrated.schemaVersion).toBe(1);
		expect(migrated.settings.ai).toEqual({
			enabled: true,
			access: "free-proxy",
			modelId: "stealth/ox-alpha",
		});
	});

	test("never exports or imports credential fields", () => {
		const data: LocalData = {
			schemaVersion: 1,
			settings: {
				theme: "system",
				updatePolicy: "notify",
				defaultProfileId: null,
				ai: {
					enabled: false,
					access: "byok",
					modelId: "openai/gpt-5-mini",
				},
			},
			profiles: [],
			sessions: [],
		};
		const exported = exportLocalData(data, timestamp);
		expect(exported).not.toContain("apiKey");
		expect(exported).not.toContain("sk-or-test");
		const parsed = JSON.parse(exported) as Record<string, unknown>;
		parsed.openRouterKey = "sk-or-test";
		expect(() => importLocalData(JSON.stringify(parsed))).toThrow(
			"cannot contain credentials",
		);
	});
});

const profile: Profile = {
	id: "profile-1",
	name: "Main",
	dpi: 800,
	gameId: "valorant",
	lastCmPer360: 40,
	createdAt: timestamp,
	updatedAt: timestamp,
};

const state: StoredSession["state"] = {
	config: {
		id: "session-1",
		baselineCmPer360: 40,
		inputMode: "native-relative",
		seed: 42,
	},
	stage: "screening",
	paused: true,
	pending: [],
	completed: [
		{
			spec: {
				id: "trial-1",
				stage: "screening",
				dimension: "flicking",
				candidate: { id: "sens-40_00", cmPer360: 40 },
				durationMs: 18_000,
				blindLabel: null,
				attempt: 1,
			},
			result: {
				accepted: true,
				observation: {
					id: "trial-1",
					candidate: { id: "sens-40_00", cmPer360: 40 },
					durationMs: 18_000,
					inputMode: "native-relative",
					policyVersion: "1.0.0",
					dimension: "flicking",
					attempts: 12,
					hits: 10,
					meanAcquisitionMs: 420,
					meanErrorRatio: 0.3,
					acquisitionVariation: 0.12,
				},
				parts: {
					accuracy: 0.8,
					precision: 0.75,
					speed: 0.7,
					stability: 0.85,
				},
				score: 78,
			},
		},
	],
	invalidTrials: 1,
	comfort: {},
	leaderBeforeValidation: null,
	result: null,
};

const session: StoredSession = {
	id: "session-1",
	profileId: "profile-1",
	state,
	createdAt: timestamp,
	updatedAt: timestamp,
};

async function temporaryDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rawsens-repository-"));
	temporaryDirectories.push(directory);
	return directory;
}
