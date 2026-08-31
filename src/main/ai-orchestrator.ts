import { z } from "zod";
import { offerAiTrial } from "../domain/session-controller";
import type { SessionState } from "../domain/session-types";
import {
	type AiPurpose,
	type AiRequest,
	type AiResponse,
	type AiRunErrorCode,
	type AiRunResult,
	aiResponseSchema,
	deriveAiRequest,
	sponsoredModelId,
} from "../shared/ai-contract";
import type { LocalSettings } from "../shared/local-data";
import type { CredentialVault } from "./credential-vault";
import {
	AiProviderError,
	type FetchLike,
	OpenRouterClient,
} from "./openrouter-client";

const sponsoredResponseSchema = z
	.object({ response: aiResponseSchema })
	.strict();

type AiSettings = LocalSettings["ai"];

export class AiOrchestrator {
	readonly #vault: CredentialVault;
	readonly #openRouter: OpenRouterClient;
	readonly #fetch: FetchLike;
	readonly #sponsoredUrl: string | null;
	readonly #timeoutMs: number;
	readonly #active = new Map<string, AbortController>();

	constructor(options: {
		vault: CredentialVault;
		openRouter?: OpenRouterClient;
		fetch?: FetchLike;
		sponsoredUrl?: string | null;
		timeoutMs?: number;
	}) {
		this.#vault = options.vault;
		this.#openRouter = options.openRouter ?? new OpenRouterClient();
		this.#fetch = options.fetch ?? fetch;
		this.#sponsoredUrl = normalizeSponsoredUrl(options.sponsoredUrl ?? null);
		this.#timeoutMs = options.timeoutMs ?? 20_000;
	}

	async run(options: {
		requestId: string;
		purpose: AiPurpose;
		state: SessionState;
		settings: AiSettings;
		userFeedback: string | null;
	}): Promise<AiRunResult> {
		if (!options.settings.enabled) {
			return {
				requestId: options.requestId,
				status: "disabled",
				modelId: null,
				response: null,
				session: options.state,
				message: "AI is disabled. Deterministic calibration remains active.",
			};
		}
		const modelId =
			options.settings.access === "free-proxy"
				? sponsoredModelId
				: options.settings.modelId;
		if (!/^[a-zA-Z0-9._-]{1,100}$/.test(options.requestId)) {
			return fallbackResult(
				options.requestId,
				modelId,
				options.state,
				new RawSensAiError("invalid-output", "AI request ID is invalid."),
			);
		}
		if (!options.settings.disclosureAcceptedAt) {
			return fallbackResult(
				options.requestId,
				modelId,
				options.state,
				new RawSensAiError(
					"disclosure-required",
					"Review and accept the AI data disclosure before sending a request.",
				),
			);
		}

		const controller = new AbortController();
		this.#active.get(options.requestId)?.abort("cancelled");
		this.#active.set(options.requestId, controller);
		const timeout = setTimeout(
			() => controller.abort("timeout"),
			this.#timeoutMs,
		);
		try {
			const request = deriveAiRequest(
				options.state,
				options.purpose,
				options.userFeedback,
			);
			const response =
				options.settings.access === "free-proxy"
					? await this.#runSponsored(request, controller.signal)
					: await this.#runByok(
							options.settings.modelId,
							request,
							controller.signal,
						);
			const nextState = applyBoundedResponse(
				options.state,
				options.purpose,
				response,
			);
			return {
				requestId: options.requestId,
				status: "completed",
				modelId,
				response,
				session: nextState,
				message:
					nextState === options.state
						? "AI explanation ready; the deterministic session is unchanged."
						: "AI proposed a policy-compliant follow-up trial.",
			};
		} catch (error) {
			return fallbackResult(options.requestId, modelId, options.state, error);
		} finally {
			clearTimeout(timeout);
			if (this.#active.get(options.requestId) === controller) {
				this.#active.delete(options.requestId);
			}
		}
	}

	cancel(requestId: string): boolean {
		const controller = this.#active.get(requestId);
		if (!controller) return false;
		controller.abort("cancelled");
		return true;
	}

	async #runByok(
		modelId: string,
		request: AiRequest,
		signal: AbortSignal,
	): Promise<AiResponse> {
		const apiKey = await this.#vault.getOpenRouterKey();
		if (!apiKey) {
			throw new RawSensAiError(
				"credential-missing",
				"Add an OpenRouter key or disable BYOK mode.",
			);
		}
		return this.#openRouter.complete({
			modelId,
			apiKey,
			request,
			structuredOutput: await this.#openRouter.supportsStructuredOutput(
				modelId,
				signal,
			),
			signal,
		});
	}

	async #runSponsored(
		request: AiRequest,
		signal: AbortSignal,
	): Promise<AiResponse> {
		if (!this.#sponsoredUrl) {
			throw new RawSensAiError(
				"sponsored-unavailable",
				"Sponsored AI is not configured in this build. Deterministic calibration still works.",
			);
		}
		let response: Response;
		try {
			response = await this.#fetch(this.#sponsoredUrl, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					version: 1,
					modelId: sponsoredModelId,
					request,
				}),
				signal,
			});
		} catch {
			throw requestError(signal);
		}
		if (response.status === 429) {
			throw new RawSensAiError(
				"rate-limited",
				"Sponsored AI is rate-limited. The deterministic session is unchanged.",
			);
		}
		if (response.status === 404 || response.status === 410) {
			throw new RawSensAiError(
				"sponsored-unavailable",
				"Sponsored AI is currently unavailable. The deterministic session is unchanged.",
			);
		}
		if (!response.ok) {
			throw new RawSensAiError(
				"provider-error",
				"Sponsored AI could not answer. The deterministic session is unchanged.",
			);
		}
		const parsed = sponsoredResponseSchema.safeParse(await safeJson(response));
		if (!parsed.success) {
			throw new RawSensAiError(
				"invalid-output",
				"Sponsored AI returned an invalid answer. The deterministic session is unchanged.",
			);
		}
		return parsed.data.response;
	}
}

class RawSensAiError extends Error {
	readonly code: AiRunErrorCode;

	constructor(code: AiRunErrorCode, message: string) {
		super(message);
		this.name = "RawSensAiError";
		this.code = code;
	}
}

function applyBoundedResponse(
	state: SessionState,
	purpose: AiPurpose,
	response: AiResponse,
): SessionState {
	if (purpose === "explain-result") {
		if (response.proposal !== null) {
			throw new RawSensAiError(
				"invalid-output",
				"An explanation cannot add a trial. The deterministic session is unchanged.",
			);
		}
		return state;
	}
	if (!response.proposal) return state;
	const next = offerAiTrial(state, response.proposal);
	if (next === state) {
		throw new RawSensAiError(
			"invalid-output",
			"The AI trial was outside deterministic policy bounds and was ignored.",
		);
	}
	return next;
}

function fallbackResult(
	requestId: string,
	modelId: string,
	state: SessionState,
	error: unknown,
): AiRunResult {
	const safeError =
		error instanceof RawSensAiError || error instanceof AiProviderError
			? error
			: new RawSensAiError(
					"provider-error",
					"AI could not answer. The deterministic session is unchanged.",
				);
	return {
		requestId,
		status: "fallback",
		modelId,
		response: null,
		session: state,
		code: safeError.code,
		message: safeError.message,
	};
}

function requestError(signal: AbortSignal): RawSensAiError {
	if (signal.aborted) {
		const timeout = signal.reason === "timeout";
		return new RawSensAiError(
			timeout ? "timeout" : "cancelled",
			timeout
				? "The AI request timed out. The deterministic session is unchanged."
				: "The AI request was cancelled.",
		);
	}
	return new RawSensAiError(
		"provider-error",
		"Sponsored AI could not be reached.",
	);
}

function normalizeSponsoredUrl(value: string | null): string | null {
	if (!value) return null;
	const url = new URL(value);
	if (
		url.protocol !== "https:" &&
		!(
			url.protocol === "http:" &&
			["127.0.0.1", "localhost"].includes(url.hostname)
		)
	) {
		throw new Error("Sponsored AI URL must use HTTPS.");
	}
	return url.toString();
}

async function safeJson(response: Response): Promise<unknown> {
	try {
		return await response.json();
	} catch {
		return null;
	}
}
