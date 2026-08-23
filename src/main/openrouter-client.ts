import { z } from "zod";
import {
	type AiModelCatalog,
	type AiModelSummary,
	type AiRequest,
	type AiResponse,
	aiResponseSchema,
	maintainedAiModelPresets,
} from "../shared/ai-contract";
import { createAiChatCompletionBody } from "../shared/ai-prompt";

const openRouterBaseUrl = "https://openrouter.ai/api/v1";
const modelCacheDurationMs = 6 * 60 * 60 * 1_000;

const modelSchema = z.object({
	id: z.string().min(3),
	name: z.string().min(1),
	context_length: z.number().int().positive().nullable().optional(),
	pricing: z
		.object({
			prompt: z.string().optional(),
			completion: z.string().optional(),
		})
		.optional(),
	supported_parameters: z.array(z.string()).nullable().optional(),
	architecture: z
		.object({ output_modalities: z.array(z.string()).nullable().optional() })
		.optional(),
});

const modelCatalogSchema = z.object({ data: z.array(modelSchema) });
const completionSchema = z.object({
	choices: z
		.array(
			z.object({
				finish_reason: z.string().nullable().optional(),
				message: z.object({
					content: z.string().nullable(),
					refusal: z.string().nullable().optional(),
				}),
			}),
		)
		.min(1),
});

export type AiProviderErrorCode =
	| "cancelled"
	| "credential-invalid"
	| "insufficient-credits"
	| "invalid-output"
	| "model-unavailable"
	| "provider-error"
	| "rate-limited"
	| "timeout";

export class AiProviderError extends Error {
	readonly code: AiProviderErrorCode;

	constructor(code: AiProviderErrorCode, message: string) {
		super(message);
		this.name = "AiProviderError";
		this.code = code;
	}
}

export type FetchLike = (
	input: RequestInfo | URL,
	init?: RequestInit,
) => Promise<Response>;

export class OpenRouterClient {
	readonly #fetch: FetchLike;
	readonly #baseUrl: string;
	#catalog: AiModelCatalog | null = null;
	#catalogExpiresAt = 0;

	constructor(options?: { fetch?: FetchLike; baseUrl?: string }) {
		this.#fetch = options?.fetch ?? fetch;
		this.#baseUrl = options?.baseUrl ?? openRouterBaseUrl;
	}

	async complete(options: {
		modelId: string;
		apiKey: string;
		request: AiRequest;
		structuredOutput: boolean;
		signal: AbortSignal;
	}): Promise<AiResponse> {
		assertModelId(options.modelId);
		if (options.signal.aborted) {
			throw requestFailure(options.signal);
		}
		const body = createAiChatCompletionBody(
			options.request,
			options.modelId,
			options.structuredOutput,
		);

		let response: Response;
		try {
			response = await this.#fetch(`${this.#baseUrl}/chat/completions`, {
				method: "POST",
				headers: {
					Authorization: `Bearer ${options.apiKey}`,
					"Content-Type": "application/json",
					"HTTP-Referer": "https://github.com/D3OXY/rawsens",
					"X-Title": "RawSens",
				},
				body: JSON.stringify(body),
				signal: options.signal,
			});
		} catch {
			throw requestFailure(options.signal);
		}

		if (!response.ok) throw httpFailure(response.status);
		const completion = completionSchema.safeParse(await safeJson(response));
		if (!completion.success) {
			throw new AiProviderError(
				"invalid-output",
				"The model provider returned an unexpected response.",
			);
		}
		const choice = completion.data.choices[0];
		if (!choice || choice.message.refusal || !choice.message.content) {
			throw new AiProviderError(
				"invalid-output",
				"The model did not return a usable answer.",
			);
		}

		let value: unknown;
		try {
			value = JSON.parse(choice.message.content);
		} catch {
			throw new AiProviderError(
				"invalid-output",
				"The model returned malformed JSON.",
			);
		}
		const parsed = aiResponseSchema.safeParse(value);
		if (!parsed.success) {
			throw new AiProviderError(
				"invalid-output",
				"The model answer did not match the RawSens contract.",
			);
		}
		return parsed.data;
	}

	async getCatalog(
		refresh = false,
		signal?: AbortSignal,
	): Promise<AiModelCatalog> {
		if (!refresh && this.#catalog && Date.now() < this.#catalogExpiresAt) {
			return this.#catalog;
		}

		try {
			const requestSignal = signal ?? AbortSignal.timeout(10_000);
			const response = await this.#fetch(
				`${this.#baseUrl}/models?output_modalities=text`,
				{ headers: { "X-Title": "RawSens" }, signal: requestSignal },
			);
			if (!response.ok)
				throw new Error(`Model catalog returned ${response.status}.`);
			const parsed = modelCatalogSchema.parse(await response.json());
			const presetIds = new Set<string>(
				maintainedAiModelPresets.map((preset) => preset.id),
			);
			const models = parsed.data
				.filter(
					(model) =>
						!model.architecture?.output_modalities ||
						model.architecture.output_modalities.includes("text"),
				)
				.map(
					(model): AiModelSummary => ({
						id: model.id,
						name: model.name,
						contextLength: model.context_length ?? null,
						inputPrice: model.pricing?.prompt ?? null,
						outputPrice: model.pricing?.completion ?? null,
						structuredOutput:
							model.supported_parameters?.includes("response_format") ?? false,
						available: true,
						preset: presetIds.has(model.id),
					}),
				)
				.sort((left, right) => left.name.localeCompare(right.name));
			const modelsById = new Map(models.map((model) => [model.id, model]));
			const presets = maintainedAiModelPresets.map(
				(preset): AiModelSummary =>
					modelsById.get(preset.id) ?? {
						id: preset.id,
						name: preset.name,
						contextLength: null,
						inputPrice: null,
						outputPrice: null,
						structuredOutput: false,
						available: false,
						preset: true,
					},
			);
			this.#catalog = {
				models,
				presets,
				refreshedAt: new Date().toISOString(),
				stale: false,
			};
			this.#catalogExpiresAt = Date.now() + modelCacheDurationMs;
			return this.#catalog;
		} catch {
			if (this.#catalog) return { ...this.#catalog, stale: true };
			return {
				models: [],
				presets: maintainedAiModelPresets.map((preset) => ({
					...preset,
					contextLength: null,
					inputPrice: null,
					outputPrice: null,
					structuredOutput: false,
					available: false,
					preset: true,
				})),
				refreshedAt: new Date().toISOString(),
				stale: true,
			};
		}
	}

	async supportsStructuredOutput(
		modelId: string,
		signal?: AbortSignal,
	): Promise<boolean> {
		const catalog = await this.getCatalog(false, signal);
		return (
			catalog.models.find((model) => model.id === modelId)?.structuredOutput ??
			false
		);
	}
}

export function assertModelId(modelId: string): void {
	if (
		modelId.length > 200 ||
		!/^[a-zA-Z0-9._-]+\/[a-zA-Z0-9._:-]+$/.test(modelId)
	) {
		throw new AiProviderError(
			"model-unavailable",
			"Enter a valid OpenRouter model ID such as author/model.",
		);
	}
}

function httpFailure(status: number): AiProviderError {
	if (status === 404) {
		return new AiProviderError(
			"model-unavailable",
			"The selected model is not available on OpenRouter.",
		);
	}
	if (status === 429) {
		return new AiProviderError(
			"rate-limited",
			"The model is rate-limited. RawSens kept the deterministic session unchanged.",
		);
	}
	if (status === 401 || status === 403) {
		return new AiProviderError(
			"credential-invalid",
			"OpenRouter rejected the saved API key.",
		);
	}
	if (status === 402) {
		return new AiProviderError(
			"insufficient-credits",
			"The OpenRouter account has insufficient credits for this model.",
		);
	}
	return new AiProviderError(
		"provider-error",
		"The model provider is temporarily unavailable.",
	);
}

function requestFailure(signal: AbortSignal): AiProviderError {
	if (signal.aborted) {
		const timedOut = signal.reason === "timeout";
		return new AiProviderError(
			timedOut ? "timeout" : "cancelled",
			timedOut
				? "The AI request timed out. RawSens kept the deterministic session unchanged."
				: "The AI request was cancelled.",
		);
	}
	return new AiProviderError(
		"provider-error",
		"OpenRouter could not be reached.",
	);
}

async function safeJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
