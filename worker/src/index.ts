import { z } from "zod";
import {
	aiRequestSchema,
	aiResponseSchema,
	sponsoredModelId,
} from "../../src/shared/ai-contract";
import { createAiChatCompletionBody } from "../../src/shared/ai-prompt";

const maximumRequestBytes = 64 * 1_024;
const maximumResponseBytes = 128 * 1_024;
const defaultUpstreamTimeoutMs = 20_000;

const inferenceRequestSchema = z
	.object({
		version: z.literal(1),
		modelId: z.literal(sponsoredModelId),
		request: aiRequestSchema,
	})
	.strict();

const completionSchema = z.object({
	choices: z
		.array(
			z.object({
				message: z.object({ content: z.string().nullable() }),
			}),
		)
		.min(1),
});

export type RateLimiter = {
	limit(options: { key: string }): Promise<{ success: boolean }>;
};

export type Env = {
	OPENROUTER_API_KEY: string;
	SPONSORED_AI_ENABLED: string;
	SPONSORED_RATE_LIMITER: RateLimiter;
};

export type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

type WorkerDependencies = {
	fetch: FetchLike;
	upstreamUrl: string;
	timeoutMs: number;
};

const defaultDependencies: WorkerDependencies = {
	fetch,
	upstreamUrl: "https://openrouter.ai/api/v1/chat/completions",
	timeoutMs: defaultUpstreamTimeoutMs,
};

export function createSponsoredWorker(
	overrides: Partial<WorkerDependencies> = {},
) {
	const dependencies = { ...defaultDependencies, ...overrides };
	return {
		async fetch(request: Request, env: Env): Promise<Response> {
			const url = new URL(request.url);
			if (url.pathname !== "/v1/infer") {
				return errorResponse(404, "not_found", "Route not found.");
			}
			if (request.method !== "POST") {
				return errorResponse(405, "method_not_allowed", "Use POST.", {
					Allow: "POST",
				});
			}
			if (!isJson(request.headers.get("Content-Type"))) {
				return errorResponse(
					415,
					"invalid_content_type",
					"Content-Type must be application/json.",
				);
			}
			const declaredLength = Number(request.headers.get("Content-Length"));
			if (
				Number.isFinite(declaredLength) &&
				declaredLength > maximumRequestBytes
			) {
				return errorResponse(
					413,
					"request_too_large",
					"Request body is too large.",
				);
			}
			if (env.SPONSORED_AI_ENABLED !== "true") {
				return errorResponse(
					410,
					"sponsored_disabled",
					"Sponsored AI is disabled. Use OpenRouter BYOK or continue without AI.",
				);
			}

			const rateLimit = await env.SPONSORED_RATE_LIMITER.limit({
				key: request.headers.get("CF-Connecting-IP") ?? "unknown",
			});
			if (!rateLimit.success) {
				return errorResponse(
					429,
					"rate_limited",
					"Sponsored AI rate limit reached. Try later or use OpenRouter BYOK.",
					{ "Retry-After": "60" },
				);
			}

			const body = await readJsonBody(request);
			if (!body.ok) return body.response;
			const parsed = inferenceRequestSchema.safeParse(body.value);
			if (!parsed.success) {
				return errorResponse(
					400,
					"invalid_request",
					"Request does not match the RawSens inference contract.",
				);
			}
			if (!env.OPENROUTER_API_KEY) {
				return errorResponse(
					503,
					"upstream_unavailable",
					"Sponsored AI is temporarily unavailable.",
				);
			}

			const controller = new AbortController();
			const timeout = setTimeout(
				() => controller.abort("timeout"),
				dependencies.timeoutMs,
			);
			let upstream: Response;
			try {
				upstream = await dependencies.fetch(dependencies.upstreamUrl, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
						"Content-Type": "application/json",
						"HTTP-Referer": "https://github.com/D3OXY/rawsens",
						"X-Title": "RawSens Sponsored",
					},
					body: JSON.stringify(
						createAiChatCompletionBody(
							parsed.data.request,
							sponsoredModelId,
							true,
						),
					),
					signal: controller.signal,
				});
			} catch {
				return controller.signal.aborted
					? errorResponse(504, "upstream_timeout", "Sponsored AI timed out.")
					: errorResponse(
							502,
							"upstream_unavailable",
							"Sponsored AI is temporarily unavailable.",
						);
			} finally {
				clearTimeout(timeout);
			}

			if (!upstream.ok) {
				return errorResponse(
					502,
					"upstream_unavailable",
					"Sponsored AI is temporarily unavailable.",
				);
			}
			const upstreamBody = await readLimitedBody(upstream);
			if (!upstreamBody.ok) return upstreamBody.response;
			const completion = completionSchema.safeParse(upstreamBody.value);
			const content = completion.success
				? completion.data.choices[0]?.message.content
				: null;
			if (!content) {
				return errorResponse(
					502,
					"invalid_upstream_response",
					"Sponsored AI returned an invalid answer.",
				);
			}
			const answer = parseJson(content);
			const validated = aiResponseSchema.safeParse(
				answer.ok ? answer.value : null,
			);
			if (!validated.success) {
				return errorResponse(
					502,
					"invalid_upstream_response",
					"Sponsored AI returned an invalid answer.",
				);
			}
			return jsonResponse({ response: validated.data });
		},
	};
}

async function readJsonBody(
	request: Request,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
	const bytes = await readLimitedBytes(request.body, maximumRequestBytes);
	if (!bytes) {
		return {
			ok: false,
			response: errorResponse(
				413,
				"request_too_large",
				"Request body is too large.",
			),
		};
	}
	const parsed = parseJson(new TextDecoder().decode(bytes));
	return parsed.ok
		? { ok: true, value: parsed.value }
		: {
				ok: false,
				response: errorResponse(
					400,
					"invalid_json",
					"Request body is not valid JSON.",
				),
			};
}

async function readLimitedBody(
	response: Response,
): Promise<{ ok: true; value: unknown } | { ok: false; response: Response }> {
	const declaredLength = Number(response.headers.get("Content-Length"));
	if (
		Number.isFinite(declaredLength) &&
		declaredLength > maximumResponseBytes
	) {
		return {
			ok: false,
			response: errorResponse(
				502,
				"upstream_response_too_large",
				"Sponsored AI returned an oversized answer.",
			),
		};
	}
	const bytes = await readLimitedBytes(response.body, maximumResponseBytes);
	if (!bytes) {
		return {
			ok: false,
			response: errorResponse(
				502,
				"upstream_response_too_large",
				"Sponsored AI returned an oversized answer.",
			),
		};
	}
	const parsed = parseJson(new TextDecoder().decode(bytes));
	return { ok: true, value: parsed.ok ? parsed.value : null };
}

async function readLimitedBytes(
	body: ReadableStream<Uint8Array> | null,
	maximumBytes: number,
): Promise<Uint8Array | null> {
	if (!body) return new Uint8Array();
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	let total = 0;
	while (true) {
		const chunk = await reader.read();
		if (chunk.done) break;
		total += chunk.value.byteLength;
		if (total > maximumBytes) {
			await reader.cancel();
			return null;
		}
		chunks.push(chunk.value);
	}
	const bytes = new Uint8Array(total);
	let offset = 0;
	for (const chunk of chunks) {
		bytes.set(chunk, offset);
		offset += chunk.byteLength;
	}
	return bytes;
}

function parseJson(
	value: string,
): { ok: true; value: unknown } | { ok: false } {
	try {
		return { ok: true, value: JSON.parse(value) };
	} catch {
		return { ok: false };
	}
}

function isJson(contentType: string | null): boolean {
	return (
		contentType?.split(";", 1)[0]?.trim().toLowerCase() === "application/json"
	);
}

function errorResponse(
	status: number,
	code: string,
	message: string,
	headers?: HeadersInit,
): Response {
	return jsonResponse({ error: { code, message } }, status, headers);
}

function jsonResponse(
	value: unknown,
	status = 200,
	headers?: HeadersInit,
): Response {
	return new Response(JSON.stringify(value), {
		status,
		headers: {
			"Cache-Control": "no-store",
			"Content-Type": "application/json; charset=utf-8",
			"X-Content-Type-Options": "nosniff",
			...headers,
		},
	});
}

export default createSponsoredWorker();
