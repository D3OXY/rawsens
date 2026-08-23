import { describe, expect, test } from "bun:test";
import type { AiRequest } from "../../src/shared/ai-contract";
import { sponsoredModelId } from "../../src/shared/ai-contract";
import { createSponsoredWorker, type Env, type FetchLike } from "./index";

const aiRequest: AiRequest = {
	version: 1,
	purpose: "propose-trial",
	session: {
		stage: "screening",
		baselineCmPer360: 40,
		inputMode: "hardware-raw",
		policy: {
			version: "test",
			minimumCmPer360: 5,
			maximumCmPer360: 150,
		},
		pendingCandidateRange: {
			minimumCmPer360: 30,
			maximumCmPer360: 50,
		},
		trials: [],
		comfort: [],
		result: null,
	},
	userFeedback: null,
};

const aiAnswer = {
	version: 1,
	proposal: null,
	explanation: "The current deterministic plan is sufficient.",
	trainingRecommendation: "Practice controlled tracking.",
};

describe("sponsored inference Worker", () => {
	test("proxies only Ox Alpha with the secret confined to authorization", async () => {
		let upstreamCalls = 0;
		let upstreamBody = "";
		let upstreamAuthorization = "";
		let limitedIp = "";
		const upstream: FetchLike = async (_input, init) => {
			upstreamCalls += 1;
			upstreamBody = String(init?.body);
			upstreamAuthorization =
				new Headers(init?.headers).get("Authorization") ?? "";
			return completionResponse(aiAnswer);
		};
		const env = enabledEnv({
			limit: async ({ key }) => {
				limitedIp = key;
				return { success: true };
			},
		});
		const response = await createSponsoredWorker({ fetch: upstream }).fetch(
			inferenceRequest(),
			env,
		);
		const responseText = await response.text();

		expect(response.status).toBe(200);
		expect(JSON.parse(responseText)).toEqual({ response: aiAnswer });
		expect(response.headers.get("Cache-Control")).toBe("no-store");
		expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
		expect(upstreamCalls).toBe(1);
		expect(limitedIp).toBe("203.0.113.9");
		expect(upstreamAuthorization).toBe("Bearer sponsor-secret");
		expect(JSON.parse(upstreamBody)).toMatchObject({ model: sponsoredModelId });
		expect(upstreamBody).not.toContain("sponsor-secret");
		expect(responseText).not.toContain("sponsor-secret");
	});

	test("rejects client-selected models before OpenRouter", async () => {
		let upstreamCalls = 0;
		const worker = createSponsoredWorker({
			fetch: async () => {
				upstreamCalls += 1;
				return completionResponse(aiAnswer);
			},
		});
		const response = await worker.fetch(
			inferenceRequest({ modelId: "openai/gpt-5.4-mini" }),
			enabledEnv(),
		);
		expect(response.status).toBe(400);
		expect(await errorCode(response)).toBe("invalid_request");
		expect(upstreamCalls).toBe(0);
	});

	test("rate limits by connecting IP before calling upstream", async () => {
		let upstreamCalls = 0;
		const worker = createSponsoredWorker({
			fetch: async () => {
				upstreamCalls += 1;
				return completionResponse(aiAnswer);
			},
		});
		const response = await worker.fetch(
			inferenceRequest(),
			enabledEnv({ limit: async () => ({ success: false }) }),
		);
		expect(response.status).toBe(429);
		expect(response.headers.get("Retry-After")).toBe("60");
		expect(await errorCode(response)).toBe("rate_limited");
		expect(upstreamCalls).toBe(0);
	});

	test("kill switch gives stable BYOK guidance without reading upstream", async () => {
		let upstreamCalls = 0;
		const worker = createSponsoredWorker({
			fetch: async () => {
				upstreamCalls += 1;
				return completionResponse(aiAnswer);
			},
		});
		const response = await worker.fetch(inferenceRequest(), {
			...enabledEnv(),
			SPONSORED_AI_ENABLED: "false",
		});
		const payload = await response.json();
		expect(response.status).toBe(410);
		expect(payload).toMatchObject({
			error: { code: "sponsored_disabled" },
		});
		expect(JSON.stringify(payload)).toContain("BYOK");
		expect(upstreamCalls).toBe(0);
	});

	test("enforces route, method, content type, and body size", async () => {
		const worker = createSponsoredWorker({
			fetch: async () => completionResponse(aiAnswer),
		});
		const env = enabledEnv();
		const wrongRoute = await worker.fetch(
			new Request("https://worker.test/other", { method: "POST" }),
			env,
		);
		const wrongMethod = await worker.fetch(
			new Request("https://worker.test/v1/infer"),
			env,
		);
		const wrongType = await worker.fetch(
			new Request("https://worker.test/v1/infer", {
				method: "POST",
				body: "{}",
			}),
			env,
		);
		const tooLarge = await worker.fetch(
			new Request("https://worker.test/v1/infer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ padding: "x".repeat(65 * 1_024) }),
			}),
			env,
		);

		expect(wrongRoute.status).toBe(404);
		expect(wrongMethod.status).toBe(405);
		expect(wrongMethod.headers.get("Allow")).toBe("POST");
		expect(wrongType.status).toBe(415);
		expect(tooLarge.status).toBe(413);
	});

	test("returns redacted stable errors for upstream failures and invalid output", async () => {
		const outage = createSponsoredWorker({
			fetch: async () =>
				new Response("secret upstream details", { status: 503 }),
		});
		const outageResponse = await outage.fetch(inferenceRequest(), enabledEnv());
		const outageText = await outageResponse.text();
		expect(outageResponse.status).toBe(502);
		expect(outageText).not.toContain("secret upstream details");
		expect(outageText).not.toContain("sponsor-secret");

		const invalid = createSponsoredWorker({
			fetch: async () =>
				completionResponse({ ...aiAnswer, confidence: "high" }),
		});
		const invalidResponse = await invalid.fetch(
			inferenceRequest(),
			enabledEnv(),
		);
		expect(invalidResponse.status).toBe(502);
		expect(await errorCode(invalidResponse)).toBe("invalid_upstream_response");

		const oversized = createSponsoredWorker({
			fetch: async () => new Response("x".repeat(129 * 1_024)),
		});
		const oversizedResponse = await oversized.fetch(
			inferenceRequest(),
			enabledEnv(),
		);
		expect(oversizedResponse.status).toBe(502);
		expect(await errorCode(oversizedResponse)).toBe(
			"upstream_response_too_large",
		);
	});

	test("aborts a slow upstream with a stable timeout", async () => {
		const worker = createSponsoredWorker({
			timeoutMs: 5,
			fetch: async (_input, init) =>
				new Promise<Response>((_resolve, reject) => {
					init?.signal?.addEventListener("abort", () =>
						reject(new DOMException("Aborted", "AbortError")),
					);
				}),
		});
		const response = await worker.fetch(inferenceRequest(), enabledEnv());
		expect(response.status).toBe(504);
		expect(await errorCode(response)).toBe("upstream_timeout");
	});
});

function inferenceRequest(overrides: Record<string, unknown> = {}): Request {
	return new Request("https://worker.test/v1/infer", {
		method: "POST",
		headers: {
			"CF-Connecting-IP": "203.0.113.9",
			"Content-Type": "application/json; charset=utf-8",
		},
		body: JSON.stringify({
			version: 1,
			modelId: sponsoredModelId,
			request: aiRequest,
			...overrides,
		}),
	});
}

function enabledEnv(rateLimiter?: Env["SPONSORED_RATE_LIMITER"]): Env {
	return {
		OPENROUTER_API_KEY: "sponsor-secret",
		SPONSORED_AI_ENABLED: "true",
		SPONSORED_RATE_LIMITER: rateLimiter ?? {
			limit: async () => ({ success: true }),
		},
	};
}

function completionResponse(answer: unknown): Response {
	return new Response(
		JSON.stringify({
			choices: [{ message: { content: JSON.stringify(answer) } }],
		}),
		{ headers: { "Content-Type": "application/json" } },
	);
}

async function errorCode(response: Response): Promise<string> {
	const payload = (await response.json()) as { error: { code: string } };
	return payload.error.code;
}
