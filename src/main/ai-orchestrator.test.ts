import { describe, expect, test } from "bun:test";
import type { SessionState } from "../domain/session-types";
import type { CredentialState, LocalSettings } from "../shared/local-data";
import { AiOrchestrator } from "./ai-orchestrator";
import type { CredentialVault } from "./credential-vault";
import {
	type FetchLike,
	OpenRouterClient,
	sponsoredModelId,
} from "./openrouter-client";

const validProposal = {
	version: 1 as const,
	proposal: {
		candidateCmPer360: 40,
		dimension: "tracking" as const,
		durationMs: 12_000,
		rationale: "The middle candidate needs another tracking sample.",
	},
	explanation: "Tracking separates the leading candidates.",
	trainingRecommendation: "Practice steady horizontal tracking.",
};

describe("AiOrchestrator", () => {
	test("leaves the complete finder usable when AI is disabled", async () => {
		let calls = 0;
		const orchestrator = orchestratorWithFetch(async () => {
			calls += 1;
			return jsonResponse({});
		});
		const state = screeningState();
		const result = await orchestrator.run({
			requestId: "disabled",
			purpose: "propose-trial",
			state,
			settings: {
				enabled: false,
				access: "byok",
				modelId: "vendor/model",
				disclosureAcceptedAt: null,
			},
			userFeedback: null,
		});
		expect(result).toMatchObject({ status: "disabled", session: state });
		expect(calls).toBe(0);
	});

	test("does not send data before disclosure acceptance", async () => {
		let calls = 0;
		const orchestrator = orchestratorWithFetch(async () => {
			calls += 1;
			return jsonResponse({});
		});
		const state = screeningState();
		const result = await orchestrator.run({
			requestId: "disclosure",
			purpose: "propose-trial",
			state,
			settings: { ...byokSettings, disclosureAcceptedAt: null },
			userFeedback: null,
		});
		expect(result).toMatchObject({
			status: "fallback",
			code: "disclosure-required",
			session: state,
		});
		expect(calls).toBe(0);
	});

	test("applies a valid custom-model proposal through deterministic bounds", async () => {
		let completionBody = "";
		const orchestrator = orchestratorWithFetch(async (input, init) => {
			if (String(input).includes("/models?"))
				return modelCatalog("vendor/model");
			completionBody = String(init?.body);
			return completion(validProposal);
		});
		const state = screeningState();
		const result = await orchestrator.run({
			requestId: "valid-custom",
			purpose: "propose-trial",
			state,
			settings: byokSettings,
			userFeedback: "The faster option felt shaky.",
		});

		expect(result.status).toBe("completed");
		expect(result.session).not.toBe(state);
		expect(result.session.pending[0]).toMatchObject({
			dimension: "tracking",
			candidate: { cmPer360: 40 },
			durationMs: 12_000,
		});
		expect(completionBody).toContain("The faster option felt shaky.");
		expect(completionBody).not.toContain("sk-test-secret");
		expect(JSON.stringify(result)).not.toContain("sk-test-secret");
	});

	test("rejects out-of-bounds proposals without changing the session", async () => {
		const orchestrator = orchestratorWithFetch(async (input) => {
			if (String(input).includes("/models?"))
				return modelCatalog("vendor/model");
			return completion({
				...validProposal,
				proposal: { ...validProposal.proposal, candidateCmPer360: 90 },
			});
		});
		const state = screeningState();
		const result = await orchestrator.run({
			requestId: "bounded",
			purpose: "propose-trial",
			state,
			settings: byokSettings,
			userFeedback: null,
		});
		expect(result).toMatchObject({
			status: "fallback",
			code: "invalid-output",
			session: state,
		});
	});

	test("keeps explanations from inserting trials", async () => {
		const orchestrator = orchestratorWithFetch(async (input) => {
			if (String(input).includes("/models?"))
				return modelCatalog("vendor/model");
			return completion(validProposal);
		});
		const state = screeningState();
		const result = await orchestrator.run({
			requestId: "explanation",
			purpose: "explain-result",
			state,
			settings: byokSettings,
			userFeedback: null,
		});
		expect(result).toMatchObject({
			status: "fallback",
			code: "invalid-output",
			session: state,
		});
	});

	test("returns useful fallbacks for missing credentials and timeouts", async () => {
		const state = screeningState();
		const missingKey = orchestratorWithFetch(
			async () => jsonResponse({}),
			null,
		);
		const missingResult = await missingKey.run({
			requestId: "missing-key",
			purpose: "propose-trial",
			state,
			settings: byokSettings,
			userFeedback: null,
		});
		expect(missingResult).toMatchObject({
			status: "fallback",
			code: "credential-missing",
			session: state,
		});

		const timeout = orchestratorWithFetch(
			async (_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError")),
					);
				}),
			"sk-test-secret",
			5,
		);
		const timeoutResult = await timeout.run({
			requestId: "timeout",
			purpose: "propose-trial",
			state,
			settings: byokSettings,
			userFeedback: null,
		});
		expect(timeoutResult).toMatchObject({
			status: "fallback",
			code: "timeout",
			session: state,
		});
	});

	test("cancels an in-flight request", async () => {
		const state = screeningState();
		const orchestrator = orchestratorWithFetch(async (input, init) => {
			if (String(input).includes("/models?"))
				return modelCatalog("vendor/model");
			return new Promise<Response>((_resolve, reject) => {
				init?.signal?.addEventListener("abort", () =>
					reject(new DOMException("Aborted", "AbortError")),
				);
			});
		});
		const pending = orchestrator.run({
			requestId: "cancel-me",
			purpose: "propose-trial",
			state,
			settings: byokSettings,
			userFeedback: null,
		});
		await Promise.resolve();
		expect(orchestrator.cancel("cancel-me")).toBe(true);
		expect(await pending).toMatchObject({
			status: "fallback",
			code: "cancelled",
			session: state,
		});
	});

	test("forces sponsored requests to Ox Alpha without a user key", async () => {
		let body = "";
		const fetchMock: FetchLike = async (_input, init) => {
			body = String(init?.body);
			return jsonResponse({
				response: { ...validProposal, proposal: null },
			});
		};
		const orchestrator = new AiOrchestrator({
			vault: new FakeVault(null),
			fetch: fetchMock,
			sponsoredUrl: "https://ai.rawsens.test/v1/infer",
		});
		const result = await orchestrator.run({
			requestId: "sponsored",
			purpose: "propose-trial",
			state: screeningState(),
			settings: {
				enabled: true,
				access: "free-proxy",
				modelId: "attacker/override",
				disclosureAcceptedAt: "2026-08-23T00:00:00.000Z",
			},
			userFeedback: null,
		});
		expect(result).toMatchObject({
			status: "completed",
			modelId: sponsoredModelId,
		});
		expect(JSON.parse(body)).toMatchObject({ modelId: sponsoredModelId });
		expect(body).not.toContain("attacker/override");
	});
});

const byokSettings: LocalSettings["ai"] = {
	enabled: true,
	access: "byok",
	modelId: "vendor/model",
	disclosureAcceptedAt: "2026-08-23T00:00:00.000Z",
};

function orchestratorWithFetch(
	fetchMock: FetchLike,
	key: string | null = "sk-test-secret",
	timeoutMs = 1_000,
): AiOrchestrator {
	return new AiOrchestrator({
		vault: new FakeVault(key),
		openRouter: new OpenRouterClient({ fetch: fetchMock }),
		fetch: fetchMock,
		timeoutMs,
	});
}

class FakeVault implements CredentialVault {
	readonly #key: string | null;

	constructor(key: string | null) {
		this.#key = key;
	}

	async getState(): Promise<CredentialState> {
		return {
			openRouterConfigured: this.#key !== null,
			backend: "unavailable",
		};
	}

	async getOpenRouterKey(): Promise<string | null> {
		return this.#key;
	}

	async setOpenRouterKey(_key: string): Promise<CredentialState> {
		return { openRouterConfigured: true, backend: "unavailable" };
	}

	async deleteOpenRouterKey(): Promise<CredentialState> {
		return { openRouterConfigured: false, backend: "unavailable" };
	}
}

function screeningState(): SessionState {
	return {
		config: {
			id: "session-ai-test",
			baselineCmPer360: 40,
			inputMode: "hardware-raw",
			seed: 1,
		},
		stage: "screening",
		paused: false,
		pending: [30, 50].map((cmPer360, index) => ({
			id: `screening-${index}`,
			stage: "screening" as const,
			dimension: "flicking" as const,
			candidate: { id: `cm-${cmPer360}`, cmPer360 },
			durationMs: 18_000,
			blindLabel: null,
			attempt: 1,
		})),
		completed: [],
		invalidTrials: 0,
		comfort: {},
		leaderBeforeValidation: null,
		result: null,
	};
}

function modelCatalog(modelId: string): Response {
	return jsonResponse({
		data: [
			{
				id: modelId,
				name: "Test model",
				context_length: 32_000,
				pricing: { prompt: "0", completion: "0" },
				supported_parameters: ["response_format"],
				architecture: { output_modalities: ["text"] },
			},
		],
	});
}

function completion(answer: unknown): Response {
	return jsonResponse({
		choices: [{ message: { content: JSON.stringify(answer) } }],
	});
}

function jsonResponse(value: unknown): Response {
	return new Response(JSON.stringify(value), {
		headers: { "Content-Type": "application/json" },
	});
}
