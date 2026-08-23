import type { InputMode } from "../domain/calibration-types";
import { createSession } from "../domain/session-controller";
import type { SessionState } from "../domain/session-types";
import type { LocalData, Profile, StoredSession } from "../shared/local-data";

export type OnboardingValues = {
	profileName: string;
	gameId: string;
	dpi: number;
	baselineCmPer360: number;
	inputMode: InputMode;
};

export function createProfileAndSession(
	values: OnboardingValues,
	options: { profileId: string; sessionId: string; now: string; seed: number },
): { profile: Profile; session: StoredSession } {
	const profileName = values.profileName.trim();
	if (!profileName || profileName.length > 80) {
		throw new Error("Profile name must be between 1 and 80 characters.");
	}
	if (
		!Number.isInteger(values.dpi) ||
		values.dpi < 100 ||
		values.dpi > 32_000
	) {
		throw new Error("DPI must be a whole number between 100 and 32,000.");
	}
	if (
		!Number.isFinite(values.baselineCmPer360) ||
		values.baselineCmPer360 < 5 ||
		values.baselineCmPer360 > 150
	) {
		throw new Error("Current sensitivity must be between 5 and 150 cm/360.");
	}

	const profile: Profile = {
		id: options.profileId,
		name: profileName,
		dpi: values.dpi,
		gameId: values.gameId,
		lastCmPer360: values.baselineCmPer360,
		createdAt: options.now,
		updatedAt: options.now,
	};
	const state = createSession({
		id: options.sessionId,
		baselineCmPer360: values.baselineCmPer360,
		inputMode: values.inputMode,
		seed: options.seed,
	});
	return {
		profile,
		session: {
			id: options.sessionId,
			profileId: options.profileId,
			state,
			createdAt: options.now,
			updatedAt: options.now,
		},
	};
}

const activeStages = [
	"warmup",
	"baseline",
	"screening",
	"refinement",
	"validation",
] as const;

export function sessionProgress(state: SessionState): number {
	if (state.stage === "complete") return 100;
	if (state.stage === "abandoned") return 0;
	const stageIndex = activeStages.indexOf(state.stage);
	const completedInStage = state.completed.filter(
		(trial) => trial.spec.stage === state.stage,
	).length;
	const stageTotal = completedInStage + state.pending.length;
	const stageFraction = stageTotal === 0 ? 0 : completedInStage / stageTotal;
	return Math.round(((stageIndex + stageFraction) / activeStages.length) * 100);
}

export type HistoryEntry = {
	session: StoredSession;
	profile: Profile | null;
	centralCmPer360: number | null;
	deltaFromPrevious: number | null;
};

export function historyEntries(data: LocalData): HistoryEntry[] {
	const profiles = new Map(
		data.profiles.map((profile) => [profile.id, profile]),
	);
	const newestFirst = [...data.sessions].sort((left, right) =>
		right.createdAt.localeCompare(left.createdAt),
	);
	const previousByProfile = new Map<string, number>();
	const chronological = [...newestFirst].reverse();
	const deltas = new Map<string, number | null>();
	for (const session of chronological) {
		const central = session.state.result?.central.cmPer360 ?? null;
		const profileKey = session.profileId ?? "unassigned";
		const previous = previousByProfile.get(profileKey);
		deltas.set(
			session.id,
			central !== null && previous !== undefined ? central - previous : null,
		);
		if (central !== null) previousByProfile.set(profileKey, central);
	}
	return newestFirst.map((session) => ({
		session,
		profile: session.profileId
			? (profiles.get(session.profileId) ?? null)
			: null,
		centralCmPer360: session.state.result?.central.cmPer360 ?? null,
		deltaFromPrevious: deltas.get(session.id) ?? null,
	}));
}
