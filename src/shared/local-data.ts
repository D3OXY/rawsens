import { z } from "zod";
import type { SessionState } from "../domain/session-types";

export const localDataSchemaVersion = 1 as const;

export type LocalSettings = {
	theme: "light" | "dark" | "system";
	updatePolicy: "manual" | "notify" | "download" | "automatic";
	defaultProfileId: string | null;
	ai: {
		enabled: boolean;
		access: "free-proxy" | "byok";
		modelId: string;
	};
};

export type Profile = {
	id: string;
	name: string;
	dpi: number;
	gameId: string | null;
	lastCmPer360: number | null;
	createdAt: string;
	updatedAt: string;
};

export type StoredSession = {
	id: string;
	profileId: string | null;
	state: SessionState;
	createdAt: string;
	updatedAt: string;
};

export type LocalData = {
	schemaVersion: typeof localDataSchemaVersion;
	settings: LocalSettings;
	profiles: readonly Profile[];
	sessions: readonly StoredSession[];
};

const inputModeSchema = z.enum([
	"hardware-raw",
	"native-relative",
	"compatibility-relative",
]);
const aimDimensionSchema = z.enum([
	"flicking",
	"tracking",
	"target-switching",
	"micro-correction",
]);
const candidateSchema = z
	.object({
		id: z.string().min(1),
		cmPer360: z.number().positive(),
	})
	.strict();
const trialSpecSchema = z
	.object({
		id: z.string().min(1),
		stage: z.enum([
			"warmup",
			"baseline",
			"screening",
			"refinement",
			"validation",
		]),
		dimension: aimDimensionSchema,
		candidate: candidateSchema,
		durationMs: z.number().int().positive(),
		blindLabel: z.string().nullable(),
		attempt: z.number().int().positive(),
	})
	.strict();
const observationBase = {
	id: z.string().min(1),
	candidate: candidateSchema,
	durationMs: z.number().int().positive(),
	inputMode: inputModeSchema,
	policyVersion: z.string().min(1),
};
const observationSchema = z.discriminatedUnion("dimension", [
	z
		.object({
			...observationBase,
			dimension: z.literal("flicking"),
			attempts: z.number().int().nonnegative(),
			hits: z.number().int().nonnegative(),
			meanAcquisitionMs: z.number().nonnegative(),
			meanErrorRatio: z.number().nonnegative(),
			acquisitionVariation: z.number().nonnegative(),
		})
		.strict(),
	z
		.object({
			...observationBase,
			dimension: z.literal("tracking"),
			sampleCount: z.number().int().nonnegative(),
			onTargetRatio: z.number().min(0).max(1),
			meanErrorRatio: z.number().nonnegative(),
			errorVariation: z.number().nonnegative(),
			correctionEfficiency: z.number().min(0).max(1),
		})
		.strict(),
	z
		.object({
			...observationBase,
			dimension: z.literal("target-switching"),
			attempts: z.number().int().nonnegative(),
			hits: z.number().int().nonnegative(),
			meanTransitionMs: z.number().nonnegative(),
			meanErrorRatio: z.number().nonnegative(),
			transitionVariation: z.number().nonnegative(),
		})
		.strict(),
	z
		.object({
			...observationBase,
			dimension: z.literal("micro-correction"),
			attempts: z.number().int().nonnegative(),
			hits: z.number().int().nonnegative(),
			meanSettleMs: z.number().nonnegative(),
			meanErrorRatio: z.number().nonnegative(),
			meanCorrections: z.number().nonnegative(),
			overshootRatio: z.number().min(0).max(1),
		})
		.strict(),
]);
const scorePartsSchema = z
	.object({
		accuracy: z.number().min(0).max(1),
		precision: z.number().min(0).max(1),
		speed: z.number().min(0).max(1),
		stability: z.number().min(0).max(1),
	})
	.strict();
const acceptedTrialSchema = z
	.object({
		accepted: z.literal(true),
		observation: observationSchema,
		parts: scorePartsSchema,
		score: z.number().min(0).max(100),
	})
	.strict();
const completedTrialSchema = z
	.object({
		spec: trialSpecSchema,
		result: acceptedTrialSchema,
	})
	.strict();
const comfortSchema = z
	.object({
		comfort: z.number().min(0).max(1),
		fatigue: z.number().min(0).max(1),
		shakiness: z.number().min(0).max(1),
		control: z.number().min(0).max(1),
	})
	.strict();
const candidateSummarySchema = z
	.object({
		candidate: candidateSchema,
		overallScore: z.number().min(0).max(100),
		dimensions: z.partialRecord(aimDimensionSchema, z.number().min(0).max(100)),
		trialCount: z.number().int().nonnegative(),
		variation: z.number().nonnegative(),
		comfort: comfortSchema.nullable(),
	})
	.strict();
const sessionResultSchema = z
	.object({
		status: z.enum(["recommended", "inconclusive"]),
		central: candidateSchema,
		range: z
			.object({
				minCmPer360: z.number().positive(),
				maxCmPer360: z.number().positive(),
			})
			.strict(),
		confidence: z
			.object({
				level: z.enum(["low", "medium", "high"]),
				reasons: z.array(z.string()),
			})
			.strict(),
		candidates: z.array(candidateSummarySchema),
	})
	.strict();
const sessionStateSchema = z
	.object({
		config: z
			.object({
				id: z.string().min(1),
				baselineCmPer360: z.number().positive(),
				inputMode: inputModeSchema,
				seed: z.number().int(),
			})
			.strict(),
		stage: z.enum([
			"warmup",
			"baseline",
			"screening",
			"refinement",
			"validation",
			"complete",
			"abandoned",
		]),
		paused: z.boolean(),
		pending: z.array(trialSpecSchema),
		completed: z.array(completedTrialSchema),
		invalidTrials: z.number().int().nonnegative(),
		comfort: z.record(z.string(), comfortSchema),
		leaderBeforeValidation: z.string().nullable(),
		result: sessionResultSchema.nullable(),
	})
	.strict();

export const localSettingsSchema = z
	.object({
		theme: z.enum(["light", "dark", "system"]),
		updatePolicy: z.enum(["manual", "notify", "download", "automatic"]),
		defaultProfileId: z.string().nullable(),
		ai: z
			.object({
				enabled: z.boolean(),
				access: z.enum(["free-proxy", "byok"]),
				modelId: z.string().min(1),
			})
			.strict(),
	})
	.strict();

export const profileSchema = z
	.object({
		id: z.string().min(1),
		name: z.string().min(1).max(80),
		dpi: z.number().int().min(100).max(32_000),
		gameId: z.string().nullable(),
		lastCmPer360: z.number().positive().nullable(),
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

export const storedSessionSchema = z
	.object({
		id: z.string().min(1),
		profileId: z.string().nullable(),
		state: sessionStateSchema,
		createdAt: z.iso.datetime(),
		updatedAt: z.iso.datetime(),
	})
	.strict();

export const localDataSchema = z
	.object({
		schemaVersion: z.literal(localDataSchemaVersion),
		settings: localSettingsSchema,
		profiles: z.array(profileSchema),
		sessions: z.array(storedSessionSchema),
	})
	.strict();

const portableDataSchema = localDataSchema
	.extend({ exportedAt: z.iso.datetime() })
	.strict();

const legacyDataSchema = z
	.object({
		schemaVersion: z.literal(0),
		settings: z
			.object({
				theme: z.enum(["light", "dark", "system"]),
				updatePolicy: z.enum(["manual", "notify", "download", "automatic"]),
				defaultProfileId: z.string().nullable(),
				aiEnabled: z.boolean(),
				aiModelId: z.string().min(1),
			})
			.strict(),
		profiles: z.array(profileSchema),
		sessions: z.array(storedSessionSchema),
		exportedAt: z.iso.datetime().optional(),
	})
	.strict();

export type CredentialState = {
	openRouterConfigured: boolean;
	backend: "macos-keychain" | "windows-dpapi" | "unavailable";
};

export const defaultLocalSettings: LocalSettings = {
	theme: "system",
	updatePolicy: "notify",
	defaultProfileId: null,
	ai: {
		enabled: false,
		access: "free-proxy",
		modelId: "stealth/ox-alpha",
	},
};

export function emptyLocalData(): LocalData {
	return {
		schemaVersion: localDataSchemaVersion,
		settings: defaultLocalSettings,
		profiles: [],
		sessions: [],
	};
}

export function parseLocalData(value: unknown): LocalData {
	const version = schemaVersionOf(value);
	if (version === localDataSchemaVersion) {
		const portable = portableDataSchema.safeParse(value);
		const parsed = portable.success
			? localDataSchema.parse({
					schemaVersion: portable.data.schemaVersion,
					settings: portable.data.settings,
					profiles: portable.data.profiles,
					sessions: portable.data.sessions,
				})
			: localDataSchema.parse(value);
		validateRelations(parsed);
		return parsed;
	}
	if (version === 0) {
		const migrated = migrateLegacyData(legacyDataSchema.parse(value));
		validateRelations(migrated);
		return migrated;
	}
	if (typeof version === "number" && version > localDataSchemaVersion) {
		throw new Error(
			`This data uses schema version ${version}; RawSens supports version ${localDataSchemaVersion}.`,
		);
	}
	throw new Error("Data has no supported schema version.");
}

export function importLocalData(json: string): LocalData {
	const value: unknown = JSON.parse(json);
	if (containsSecretField(value)) {
		throw new Error("Imports cannot contain credentials or secrets.");
	}
	return parseLocalData(value);
}

export function exportLocalData(
	data: LocalData,
	exportedAt = new Date().toISOString(),
): string {
	const portable = portableDataSchema.parse({
		...localDataSchema.parse(data),
		exportedAt,
	});
	return `${JSON.stringify(portable, null, 2)}\n`;
}

function migrateLegacyData(data: z.infer<typeof legacyDataSchema>): LocalData {
	return localDataSchema.parse({
		schemaVersion: localDataSchemaVersion,
		settings: {
			theme: data.settings.theme,
			updatePolicy: data.settings.updatePolicy,
			defaultProfileId: data.settings.defaultProfileId,
			ai: {
				enabled: data.settings.aiEnabled,
				access: "free-proxy",
				modelId: data.settings.aiModelId,
			},
		},
		profiles: data.profiles,
		sessions: data.sessions,
	});
}

function schemaVersionOf(value: unknown): unknown {
	if (typeof value !== "object" || value === null) return null;
	return Reflect.get(value, "schemaVersion");
}

function containsSecretField(value: unknown): boolean {
	if (Array.isArray(value)) return value.some(containsSecretField);
	if (typeof value !== "object" || value === null) return false;
	for (const [key, nested] of Object.entries(value)) {
		const normalized = key.replaceAll(/[^a-z]/gi, "").toLowerCase();
		if (
			normalized.includes("credential") ||
			normalized.includes("secret") ||
			normalized.includes("apikey") ||
			normalized.includes("openrouterkey")
		)
			return true;
		if (containsSecretField(nested)) return true;
	}
	return false;
}

function validateRelations(data: LocalData): void {
	const profileIds = uniqueIds(data.profiles, "profile");
	uniqueIds(data.sessions, "session");
	if (
		data.settings.defaultProfileId &&
		!profileIds.has(data.settings.defaultProfileId)
	) {
		throw new Error("Default profile does not exist.");
	}
	for (const session of data.sessions) {
		if (session.profileId && !profileIds.has(session.profileId)) {
			throw new Error(`Session ${session.id} references an unknown profile.`);
		}
		if (session.state.config.id !== session.id) {
			throw new Error(`Session ${session.id} has a mismatched state ID.`);
		}
		for (const trial of session.state.completed) {
			if (
				trial.spec.id !== trial.result.observation.id ||
				trial.spec.dimension !== trial.result.observation.dimension ||
				trial.spec.candidate.id !== trial.result.observation.candidate.id
			) {
				throw new Error(
					`Session ${session.id} contains a mismatched observation.`,
				);
			}
		}
	}
}

function uniqueIds(
	items: readonly { id: string }[],
	label: string,
): ReadonlySet<string> {
	const ids = new Set<string>();
	for (const item of items) {
		if (ids.has(item.id)) throw new Error(`Duplicate ${label} ID: ${item.id}`);
		ids.add(item.id);
	}
	return ids;
}
