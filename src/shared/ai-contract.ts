import { z } from "zod";
import { calibrationPolicy } from "../domain/calibration-policy";
import { aimDimensions } from "../domain/calibration-types";
import type { SessionState } from "../domain/session-types";

export const aiContractVersion = 1 as const;
export const sponsoredModelId = "stealth/ox-alpha";

export const aiDataDisclosure = [
	"Calibration stage and policy bounds",
	"Derived trial scores and score components",
	"Candidate cm/360 values and comfort feedback",
	"Deterministic result and confidence reasons, when available",
	"Optional feedback you type",
] as const;

export const aiPurposeSchema = z.enum(["propose-trial", "explain-result"]);
export type AiPurpose = z.infer<typeof aiPurposeSchema>;

const aiTrialSummarySchema = z
	.object({
		stage: z.enum([
			"warmup",
			"baseline",
			"screening",
			"refinement",
			"validation",
		]),
		dimension: z.enum(aimDimensions),
		candidateCmPer360: z.number().positive(),
		score: z.number().min(0).max(100),
		parts: z
			.object({
				accuracy: z.number().min(0).max(1),
				precision: z.number().min(0).max(1),
				speed: z.number().min(0).max(1),
				stability: z.number().min(0).max(1),
			})
			.strict(),
	})
	.strict();

const aiCandidateSummarySchema = z
	.object({
		candidateCmPer360: z.number().positive(),
		overallScore: z.number().min(0).max(100),
		variation: z.number().nonnegative(),
		trialCount: z.number().int().nonnegative(),
	})
	.strict();

export const aiRequestSchema = z
	.object({
		version: z.literal(aiContractVersion),
		purpose: aiPurposeSchema,
		session: z
			.object({
				stage: z.enum([
					"warmup",
					"baseline",
					"screening",
					"refinement",
					"validation",
					"complete",
					"abandoned",
				]),
				baselineCmPer360: z.number().positive(),
				inputMode: z.enum([
					"hardware-raw",
					"native-relative",
					"compatibility-relative",
				]),
				policy: z
					.object({
						version: z.string().min(1),
						minimumCmPer360: z.number().positive(),
						maximumCmPer360: z.number().positive(),
					})
					.strict(),
				pendingCandidateRange: z
					.object({
						minimumCmPer360: z.number().positive(),
						maximumCmPer360: z.number().positive(),
					})
					.strict()
					.nullable(),
				trials: z.array(aiTrialSummarySchema).max(128),
				comfort: z
					.array(
						z
							.object({
								candidateId: z.string().min(1),
								comfort: z.number().min(0).max(1),
								fatigue: z.number().min(0).max(1),
								shakiness: z.number().min(0).max(1),
								control: z.number().min(0).max(1),
							})
							.strict(),
					)
					.max(32),
				result: z
					.object({
						status: z.enum(["recommended", "inconclusive"]),
						centralCmPer360: z.number().positive(),
						minimumCmPer360: z.number().positive(),
						maximumCmPer360: z.number().positive(),
						confidenceLevel: z.enum(["low", "medium", "high"]),
						confidenceReasons: z.array(z.string().max(300)).max(16),
						candidates: z.array(aiCandidateSummarySchema).max(32),
					})
					.strict()
					.nullable(),
			})
			.strict(),
		userFeedback: z.string().trim().max(1_000).nullable(),
	})
	.strict();

export type AiRequest = z.infer<typeof aiRequestSchema>;

export const aiResponseSchema = z
	.object({
		version: z.literal(aiContractVersion),
		proposal: z
			.object({
				candidateCmPer360: z.number().positive(),
				dimension: z.enum(aimDimensions),
				durationMs: z.number().int().min(8_000).max(30_000),
				rationale: z.string().trim().min(1).max(600),
			})
			.strict()
			.nullable(),
		explanation: z.string().trim().min(1).max(4_000),
		trainingRecommendation: z.string().trim().min(1).max(2_000),
	})
	.strict();

export type AiResponse = z.infer<typeof aiResponseSchema>;

export type AiRunErrorCode =
	| "cancelled"
	| "credential-invalid"
	| "credential-missing"
	| "disclosure-required"
	| "insufficient-credits"
	| "invalid-output"
	| "model-unavailable"
	| "provider-error"
	| "rate-limited"
	| "sponsored-unavailable"
	| "timeout";

export type AiRunResult =
	| {
			requestId: string;
			status: "disabled";
			modelId: null;
			response: null;
			session: SessionState;
			message: string;
	  }
	| {
			requestId: string;
			status: "completed";
			modelId: string;
			response: AiResponse;
			session: SessionState;
			message: string;
	  }
	| {
			requestId: string;
			status: "fallback";
			modelId: string | null;
			response: null;
			session: SessionState;
			code: AiRunErrorCode;
			message: string;
	  };

export type AiModelSummary = {
	id: string;
	name: string;
	contextLength: number | null;
	inputPrice: string | null;
	outputPrice: string | null;
	structuredOutput: boolean;
	available: boolean;
	preset: boolean;
};

export type AiModelCatalog = {
	models: readonly AiModelSummary[];
	presets: readonly AiModelSummary[];
	refreshedAt: string;
	stale: boolean;
};

export function deriveAiRequest(
	state: SessionState,
	purpose: AiPurpose,
	userFeedback: string | null,
): AiRequest {
	const pendingValues = state.pending.map((trial) => trial.candidate.cmPer360);
	const pendingCandidateRange =
		pendingValues.length === 0
			? null
			: {
					minimumCmPer360: Math.min(...pendingValues),
					maximumCmPer360: Math.max(...pendingValues),
				};

	return aiRequestSchema.parse({
		version: aiContractVersion,
		purpose,
		session: {
			stage: state.stage,
			baselineCmPer360: state.config.baselineCmPer360,
			inputMode: state.config.inputMode,
			policy: {
				version: calibrationPolicy.version,
				minimumCmPer360: calibrationPolicy.cmPer360.min,
				maximumCmPer360: calibrationPolicy.cmPer360.max,
			},
			pendingCandidateRange,
			trials: state.completed.slice(-128).map(({ spec, result }) => ({
				stage: spec.stage,
				dimension: spec.dimension,
				candidateCmPer360: spec.candidate.cmPer360,
				score: result.score,
				parts: result.parts,
			})),
			comfort: Object.entries(state.comfort)
				.slice(-32)
				.map(([candidateId, report]) => ({ candidateId, ...report })),
			result: state.result
				? {
						status: state.result.status,
						centralCmPer360: state.result.central.cmPer360,
						minimumCmPer360: state.result.range.minCmPer360,
						maximumCmPer360: state.result.range.maxCmPer360,
						confidenceLevel: state.result.confidence.level,
						confidenceReasons: state.result.confidence.reasons,
						candidates: state.result.candidates.map((candidate) => ({
							candidateCmPer360: candidate.candidate.cmPer360,
							overallScore: candidate.overallScore,
							variation: candidate.variation,
							trialCount: candidate.trialCount,
						})),
					}
				: null,
		},
		userFeedback,
	});
}
