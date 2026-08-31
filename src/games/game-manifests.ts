export const gameManifestVersion = "1.0.0";

type ManifestSource = {
	label: string;
	url: string;
	note: string;
};

type GameManifestBase = {
	manifestVersion: typeof gameManifestVersion;
	id: string;
	displayName: string;
	settingLabel: string;
	settingLocation: string;
	instructions: readonly string[];
	assumptions: readonly string[];
	verifiedAt: string;
	sources: readonly ManifestSource[];
};

type DisplayContract = {
	minimum: number;
	maximum: number;
	decimalPlaces: number;
	unit: string;
};

export type VerifiedGameManifest = GameManifestBase & {
	conversion:
		| ({ kind: "canonical" } & DisplayContract)
		| ({
				kind: "linear-degrees-per-count";
				degreesPerCountPerSetting: number;
		  } & DisplayContract);
};

export type UnavailableGameManifest = GameManifestBase & {
	conversion: {
		kind: "unavailable";
		status: "unverified" | "unsupported";
		reason: string;
	};
};

export type GameManifest = VerifiedGameManifest | UnavailableGameManifest;

const sharedUnavailableAssumption =
	"No absolute value is produced until coefficient, range, and precision are reproducibly verified against a named game build.";

export const gameManifests = [
	{
		manifestVersion: gameManifestVersion,
		id: "generic",
		displayName: "Generic cm/360",
		settingLabel: "Physical sensitivity",
		settingLocation: "Use this value with any trusted game-specific converter.",
		instructions: [
			"Copy the cm/360 value.",
			"Enter it into a converter that supports your exact game and build.",
		],
		assumptions: ["One full horizontal turn is 360 degrees."],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "NIST length units",
				url: "https://www.nist.gov/pml/owm/si-units-length",
				note: "One international inch equals exactly 2.54 centimeters.",
			},
		],
		conversion: {
			kind: "canonical",
			minimum: 1,
			maximum: 200,
			decimalPlaces: 2,
			unit: "cm/360",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "counter-strike-2",
		displayName: "Counter-Strike 2",
		settingLabel: "Mouse sensitivity",
		settingLocation: "Settings → Keyboard / Mouse",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"Do not reuse a legacy Counter-Strike coefficient as proof of current CS2 behavior.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"Legacy Valve source documents m_yaw 0.022, but it is not Counter-Strike 2 source code.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "Steam Support: CS2 console",
				url: "https://help.steampowered.com/en/faqs/view/4700-D10E-26BE-DDDD",
				note: "Confirms the current console path, not sensitivity math.",
			},
			{
				label: "Valve Half-Life input source",
				url: "https://github.com/ValveSoftware/halflife/blob/master/cl_dll/inputw32.cpp",
				note: "Useful legacy provenance only; it cannot verify Source 2 behavior.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Current CS2 coefficient, accepted range, and stored precision are not published or build-verified yet.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "valorant",
		displayName: "VALORANT",
		settingLabel: "Sensitivity: Aim",
		settingLocation: "Settings → General → Mouse",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"Raw input is already always enabled on PC; there is no RawInputBuffer toggle to change.",
		],
		assumptions: [sharedUnavailableAssumption, "Hip-fire PC sensitivity only."],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "VALORANT Patch 11.06",
				url: "https://playvalorant.com/en-gb/news/game-updates/valorant-patch-notes-11-06/",
				note: "Confirms raw input is always enabled on PC.",
			},
			{
				label: "VALORANT Patch 3.07",
				url: "https://playvalorant.com/en-us/news/game-updates/valorant-patch-notes-3-07/",
				note: "Documents the earlier raw-input behavior, not an angular coefficient.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Riot does not publish the PC angular coefficient, accepted range, or stored precision.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "apex-legends",
		displayName: "Apex Legends",
		settingLabel: "Mouse Sensitivity",
		settingLocation: "Settings → Mouse/Keyboard",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"When support lands, Mouse Acceleration must be off and ADS must be handled separately.",
		],
		assumptions: [sharedUnavailableAssumption, "Hip-fire sensitivity only."],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "EA Apex PC features",
				url: "https://www.ea.com/able/resources/apex-legends/pc/features",
				note: "Names mouse, ADS, and acceleration controls but provides no coefficient.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"EA does not publish an absolute angular coefficient, base range, or precision.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "overwatch-2",
		displayName: "Overwatch 2",
		settingLabel: "Sensitivity",
		settingLocation: "Options → Controls → General → Mouse",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"Enable High Precision Mouse Input; handle hero-specific scoped values separately.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"All-heroes hip-fire sensitivity only.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "Overwatch 2 developer update",
				url: "https://overwatch.blizzard.com/en-us/news/23865965/",
				note: "Documents high-precision input, not sensitivity math.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Blizzard does not publish the angular coefficient, accepted range, or precision.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "fortnite",
		displayName: "Fortnite",
		settingLabel: "Mouse Sensitivity X and Y",
		settingLocation: "Settings → Mouse and Keyboard",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"When support lands, copy the same base value to X and Y; targeting and scope stay separate.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"Equal horizontal and vertical base sensitivity.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "Fortnite v4.4 notes",
				url: "https://www.fortnite.com/patch-notes/v4-4?lang=en-US",
				note: "Documents separate X and Y controls, not current sensitivity math.",
			},
			{
				label: "Epic settings support",
				url: "https://www.epicgames.com/help/c-202300000001690/a202300000014546?lang=en-US",
				note: "Confirms the current Mouse and Keyboard settings path.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Epic does not publish the current coefficient, accepted range, or precision.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "rainbow-six-siege",
		displayName: "Rainbow Six Siege",
		settingLabel: "Mouse Sensitivity Horizontal and Vertical",
		settingLocation: "Options → Controls → Keyboard & Mouse Options",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"Do not edit GameSettings.ini; future support will assume the default multiplier and stay copy-only.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"Ubisoft documents integer sliders from 1 to 100 and a default multiplier of 0.02, but omits the base angular coefficient.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "Ubisoft FOV and input sensitivity",
				url: "https://www.ubisoft.com/en-ca/game/rainbow-six/siege/news-updates/6kY6b5JByBY3P6vQWWinla/fov-and-input-sensitivity",
				note: "Documents relative slider math, but not absolute degrees per input unit.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Ubisoft's equation omits the base angular coefficient, so DPI and cm/360 are insufficient.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "call-of-duty",
		displayName: "Call of Duty",
		settingLabel: "Mouse Sensitivity",
		settingLocation: "Settings → Keyboard & Mouse → Mouse",
		instructions: [
			"Choose an exact Call of Duty title and build before converting.",
			"Keep ADS mode, transition timing, and per-zoom multipliers separate.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"The franchise label spans distinct releases and input implementations.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "Black Ops 6 PC controls",
				url: "https://www.callofduty.com/guides/blackops6/training/call-of-duty-guides-black-ops-6-multiplayer-training-controls",
				note: "Shows title-specific controls without publishing base sensitivity math.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unsupported",
			reason:
				"Call of Duty is not a stable conversion target; a title-specific measured manifest is required.",
		},
	},
	{
		manifestVersion: gameManifestVersion,
		id: "the-finals",
		displayName: "THE FINALS",
		settingLabel: "Mouse Look Sensitivity",
		settingLocation: "Settings → Mouse and Keyboard",
		instructions: [
			"Keep your RawSens cm/360 value for now.",
			"Leave Scoped Zoom Sensitivity Multiplier unchanged; scoped behavior is separate.",
		],
		assumptions: [
			sharedUnavailableAssumption,
			"Base hip-fire sensitivity only.",
		],
		verifiedAt: "2026-08-23",
		sources: [
			{
				label: "THE FINALS accessibility support",
				url: "https://id.embark.games/uk/the-finals/support/faq/56-accessibility-and-button-remapping",
				note: "Confirms the settings path but does not publish an angular coefficient.",
			},
		],
		conversion: {
			kind: "unavailable",
			status: "unverified",
			reason:
				"Embark does not publish the base field's coefficient, accepted range, or precision.",
		},
	},
] as const satisfies readonly GameManifest[];

export type GameId = (typeof gameManifests)[number]["id"];

export function gameManifestById(id: string): GameManifest | null {
	return gameManifests.find((manifest) => manifest.id === id) ?? null;
}

export function isVerifiedGameManifest(
	manifest: GameManifest,
): manifest is VerifiedGameManifest {
	return manifest.conversion.kind !== "unavailable";
}
