import { describe, expect, test } from "bun:test";
import type { AiRequest } from "../shared/ai-contract";
import {
	AiProviderError,
	maintainedAiModelPresets,
	OpenRouterClient,
} from "./openrouter-client";

const request: AiRequest = {
	version: 1,
	purpose: "explain-result",
	session: {
		stage: "complete",
		baselineCmPer360: 40,
		inputMode: "hardware-raw",
		policy: {
			version: "test",
			minimumCmPer360: 5,
			maximumCmPer360: 150,
		},
		pendingCandidateRange: null,
		trials: [],
		comfort: [],
		result: null,
	},
	userFeedback: null,
};

const validAnswer = {
	version: 1 as const,
	proposal: null,
	explanation: "The deterministic result is stable.",
	trainingRecommendation: "Practice short controlled tracking sets.",
};

describe("OpenRouterClient", () => {
	test("sends the key only as authorization and validates structured output", async () => {
		let sentBody = "";
		let authorization = "";
		const client = new OpenRouterClient({
			fetch: async (_input, init) => {
				sentBody = String(init?.body);
				authorization = new Headers(init?.headers).get("Authorization") ?? "";
				return jsonResponse({
					choices: [{ message: { content: JSON.stringify(validAnswer) } }],
				});
			},
		});
		const result = await client.complete({
			modelId: "vendor/custom-model",
			apiKey: "sk-secret",
			request,
			structuredOutput: true,
			signal: new AbortController().signal,
		});

		expect(result).toEqual(validAnswer);
		expect(authorization).toBe("Bearer sk-secret");
		expect(sentBody).not.toContain("sk-secret");
		expect(JSON.parse(sentBody)).toHaveProperty(
			"response_format.type",
			"json_schema",
		);
	});

	test("supports custom models that return valid JSON without schema support", async () => {
		let sentBody = "";
		const client = new OpenRouterClient({
			fetch: async (_input, init) => {
				sentBody = String(init?.body);
				return jsonResponse({
					choices: [{ message: { content: JSON.stringify(validAnswer) } }],
				});
			},
		});
		await client.complete({
			modelId: "vendor/custom-model",
			apiKey: "key",
			request,
			structuredOutput: false,
			signal: new AbortController().signal,
		});
		expect(JSON.parse(sentBody)).not.toHaveProperty("response_format");
	});

	test.each([
		[429, "rate-limited"],
		[404, "model-unavailable"],
		[401, "credential-invalid"],
		[402, "insufficient-credits"],
		[503, "provider-error"],
	] as const)("maps HTTP %i to %s", async (status, code) => {
		const client = new OpenRouterClient({
			fetch: async () => new Response(null, { status }),
		});
		expect(
			client.complete({
				modelId: "vendor/model",
				apiKey: "key",
				request,
				structuredOutput: false,
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({ code });
	});

	test("rejects refusals, malformed JSON, extra authority, and bad model IDs", async () => {
		const answers: unknown[] = [
			{ choices: [{ message: { content: null, refusal: "No" } }] },
			{ choices: [{ message: { content: "not json" } }] },
			{
				choices: [
					{
						message: {
							content: JSON.stringify({ ...validAnswer, confidence: "high" }),
						},
					},
				],
			},
		];
		for (const answer of answers) {
			const client = new OpenRouterClient({
				fetch: async () => jsonResponse(answer),
			});
			expect(
				client.complete({
					modelId: "vendor/model",
					apiKey: "key",
					request,
					structuredOutput: false,
					signal: new AbortController().signal,
				}),
			).rejects.toBeInstanceOf(AiProviderError);
		}

		const client = new OpenRouterClient({
			fetch: async () => jsonResponse({}),
		});
		expect(
			client.complete({
				modelId: "not a model",
				apiKey: "key",
				request,
				structuredOutput: false,
				signal: new AbortController().signal,
			}),
		).rejects.toMatchObject({ code: "model-unavailable" });
	});

	test("caches the live catalog and keeps maintained presets visible", async () => {
		let calls = 0;
		const client = new OpenRouterClient({
			fetch: async () => {
				calls += 1;
				return jsonResponse({
					data: [
						{
							id: "vendor/custom-model",
							name: "Custom Model",
							context_length: 32_000,
							pricing: { prompt: "0.1", completion: "0.2" },
							supported_parameters: ["response_format"],
							architecture: { output_modalities: ["text"] },
						},
					],
				});
			},
		});
		const first = await client.getCatalog();
		const second = await client.getCatalog();
		expect(calls).toBe(1);
		expect(second).toBe(first);
		expect(first.models[0]).toMatchObject({
			id: "vendor/custom-model",
			structuredOutput: true,
		});
		expect(first.presets).toHaveLength(maintainedAiModelPresets.length);
		expect(first.presets.every((preset) => preset.preset)).toBe(true);
	});
});

function jsonResponse(value: unknown, status = 200): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: { "Content-Type": "application/json" },
	});
}
