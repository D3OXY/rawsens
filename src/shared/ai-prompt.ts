import { z } from "zod";
import { type AiRequest, aiResponseSchema } from "./ai-contract";

export function createAiChatCompletionBody(
	request: AiRequest,
	modelId: string,
	structuredOutput: boolean,
): Record<string, unknown> {
	const body: Record<string, unknown> = {
		model: modelId,
		messages: [
			{ role: "system", content: aiSystemPrompt },
			{ role: "user", content: JSON.stringify(request) },
		],
		temperature: 0.2,
		max_tokens: 1_200,
	};
	if (structuredOutput) {
		body.response_format = {
			type: "json_schema",
			json_schema: {
				name: "rawsens_ai_response",
				strict: true,
				schema: z.toJSONSchema(aiResponseSchema, { target: "draft-7" }),
			},
		};
	}
	return body;
}

const aiSystemPrompt = `You are RawSens's bounded calibration assistant.
Use only the supplied derived data. Never invent or modify measured scores, confidence, or policy bounds.
For propose-trial, return at most one proposal inside pendingCandidateRange. For explain-result, proposal must be null.
Give concise explanations and practical training advice. Return only this JSON shape:
{"version":1,"proposal":null OR {"candidateCmPer360":number,"dimension":"flicking"|"tracking"|"target-switching"|"micro-correction","durationMs":integer 8000..30000,"rationale":string},"explanation":string,"trainingRecommendation":string}`;
