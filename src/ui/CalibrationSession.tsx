import { useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "#app/components/ui/alert";
import { Badge } from "#app/components/ui/badge";
import { Button } from "#app/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import { Field, FieldLabel } from "#app/components/ui/field";
import { Progress } from "#app/components/ui/progress";
import { Textarea } from "#app/components/ui/textarea";
import type { ComfortReport, ScoredTrial } from "../domain/calibration-types";
import {
	pauseSession,
	recordTrial,
	resumeSession,
	setComfort,
} from "../domain/session-controller";
import type { SessionState } from "../domain/session-types";
import { formatInputMode } from "../shared/input-protocol";
import type { StoredSession } from "../shared/local-data";
import { AppShell } from "./AppShell";
import { aiClient } from "./ai-client";
import { sessionProgress } from "./app-flow";
import { dimensionLabels } from "./dimension-labels";
import { localDataClient } from "./local-data-client";
import { TrainerCanvas } from "./TrainerCanvas";

const stageCopy: Record<
	Exclude<SessionState["stage"], "complete" | "abandoned">,
	{ title: string; description: string }
> = {
	warmup: {
		title: "Warm up",
		description:
			"Learn each task at your current sensitivity. Warmup is not ranked.",
	},
	baseline: {
		title: "Establish the baseline",
		description: "Measure your current sensitivity across every dimension.",
	},
	screening: {
		title: "Screen the range",
		description:
			"Compare five broad candidates. Candidate order is deterministic.",
	},
	refinement: {
		title: "Refine the leaders",
		description: "Test the strongest region with tighter spacing.",
	},
	validation: {
		title: "Validate blind",
		description: "Confirm the leader without showing which option it is.",
	},
};

export function CalibrationSession() {
	const { sessionId } = useParams({ from: "/session/$sessionId" });
	const navigate = useNavigate();
	const local = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	const session = local.data.sessions.find((item) => item.id === sessionId);
	const [introStage, setIntroStage] = useState<string | null>(
		session?.state.stage ?? null,
	);
	const [scored, setScored] = useState<Extract<
		ScoredTrial,
		{ accepted: true }
	> | null>(null);
	const [feedback, setFeedback] = useState<ComfortReport>({
		comfort: 0.75,
		fatigue: 0.25,
		shakiness: 0.25,
		control: 0.75,
	});
	const [note, setNote] = useState("");
	const [aiState, setAiState] = useState<{
		phase: "idle" | "running" | "done" | "error";
		message: string;
	}>({ phase: "idle", message: "" });

	useEffect(() => {
		void localDataClient.initialize();
	}, []);
	useEffect(() => {
		if (session?.state.stage === "complete")
			void navigate({ to: "/results/$sessionId", params: { sessionId } });
	}, [navigate, session?.state.stage, sessionId]);

	if (!session)
		return (
			<AppShell>
				<main className="mx-auto max-w-5xl px-6 py-16">
					<h1 className="text-xl font-semibold">Session not found</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						It may have been removed or imported under a different ID.
					</p>
				</main>
			</AppShell>
		);
	if (session.state.stage === "complete") return null;
	if (session.state.stage === "abandoned")
		return (
			<AppShell>
				<main className="mx-auto max-w-5xl px-6 py-16">
					<h1 className="text-xl font-semibold">Session abandoned</h1>
				</main>
			</AppShell>
		);
	const trial = session.state.pending[0];
	const stage = stageCopy[session.state.stage];
	const showIntro = introStage === session.state.stage || session.state.paused;

	const saveState = async (state: SessionState) => {
		const next: StoredSession = {
			...session,
			state,
			updatedAt: new Date().toISOString(),
		};
		await localDataClient.saveSession(next);
		if (state.stage === "complete" && state.result) {
			const profile = local.data.profiles.find(
				(item) => item.id === session.profileId,
			);
			if (profile)
				await localDataClient.upsertProfile({
					...profile,
					lastCmPer360: state.result.central.cmPer360,
					updatedAt: next.updatedAt,
				});
		}
	};

	const recordInvalid = async (
		result: Extract<ScoredTrial, { accepted: false }>,
	) => {
		await saveState(recordTrial(session.state, result));
	};

	const submitFeedback = async () => {
		if (!scored || !trial) return;
		const previousStage = session.state.stage;
		let next = recordTrial(session.state, scored);
		next = setComfort(next, trial.candidate.id, feedback);
		setScored(null);
		await saveState(next);
		if (next.stage !== previousStage) setIntroStage(next.stage);
	};

	const requestAiTrial = async () => {
		const requestId = crypto.randomUUID();
		setAiState({ phase: "running", message: "Asking the selected model…" });
		try {
			const result = await aiClient.run(
				requestId,
				"propose-trial",
				session.state,
				note.trim() || null,
			);
			await saveState(result.session);
			setAiState({
				phase: result.status === "completed" ? "done" : "error",
				message: result.message,
			});
		} catch (cause) {
			setAiState({
				phase: "error",
				message: cause instanceof Error ? cause.message : String(cause),
			});
		}
	};

	return (
		<AppShell>
			<main className="mx-auto max-w-5xl px-4 py-6 sm:px-6 sm:py-10">
				<div className="mb-5 flex flex-wrap items-end justify-between gap-3">
					<div>
						<div className="flex items-center gap-2">
							<Badge variant="outline">{stage.title}</Badge>
							<span className="text-xs text-muted-foreground">
								{session.state.completed.length} complete ·{" "}
								{session.state.pending.length} queued
							</span>
						</div>
						<h1 className="mt-2 text-2xl font-semibold tracking-tight">
							{trial ? dimensionLabels[trial.dimension] : "Preparing trial"}
						</h1>
					</div>
					<p className="font-mono text-sm text-muted-foreground">
						{trial?.blindLabel ??
							(trial ? `${trial.candidate.cmPer360.toFixed(2)} cm/360` : "")}
					</p>
				</div>
				<Progress
					value={sessionProgress(session.state)}
					aria-label="Calibration progress"
					className="mb-5"
				/>
				{session.state.config.inputMode === "compatibility-relative" && (
					<Alert variant="destructive" className="mb-5 p-3">
						<AlertTitle>Compatibility input—confidence is limited</AlertTitle>
						<AlertDescription>
							{formatInputMode(session.state.config.inputMode)} can be affected
							by the OS or pointer lock. Keep acceleration off and repeat
							invalid trials.
						</AlertDescription>
					</Alert>
				)}
				{showIntro ? (
					<Card className="mx-auto max-w-2xl">
						<CardHeader>
							<CardTitle>{stage.title}</CardTitle>
							<CardDescription>{stage.description}</CardDescription>
						</CardHeader>
						<CardContent className="space-y-4">
							<div className="rounded-lg border bg-muted/40 p-4 text-sm/6">
								<p className="font-medium">Before you continue</p>
								<ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
									<li>Sit naturally and use your normal grip.</li>
									<li>Prioritize controlled aim over raw speed.</li>
									<li>
										Focus loss or lost input automatically invalidates the
										trial.
									</li>
								</ul>
							</div>
							{local.data.settings.ai.enabled &&
								["screening", "refinement"].includes(session.state.stage) && (
									<div className="space-y-3">
										<Field>
											<FieldLabel htmlFor="ai-note">
												Optional note for AI
											</FieldLabel>
											<Textarea
												id="ai-note"
												value={note}
												maxLength={1000}
												placeholder="e.g. Faster candidates feel shaky"
												onChange={(event) => setNote(event.currentTarget.value)}
											/>
										</Field>
										<div className="flex flex-wrap items-center gap-3">
											<Button
												type="button"
												variant="outline"
												disabled={
													aiState.phase === "running" || !aiClient.available
												}
												onClick={() => void requestAiTrial()}
											>
												Ask AI for one bounded trial
											</Button>
											{aiState.message && (
												<p
													role="status"
													className={
														aiState.phase === "error"
															? "text-sm text-destructive"
															: "text-sm text-muted-foreground"
													}
												>
													{aiState.message}
												</p>
											)}
										</div>
									</div>
								)}
						</CardContent>
						<CardFooter className="justify-between border-t">
							<Button
								variant="ghost"
								onClick={() => void saveState(pauseSession(session.state))}
							>
								Pause
							</Button>
							<Button
								size="lg"
								onClick={() => {
									setIntroStage(null);
									if (session.state.paused)
										void saveState(resumeSession(session.state));
								}}
							>
								Begin stage
							</Button>
						</CardFooter>
					</Card>
				) : scored && trial ? (
					<Card className="mx-auto max-w-2xl">
						<CardHeader>
							<CardTitle>How did that sensitivity feel?</CardTitle>
							<CardDescription>
								Score {scored.score.toFixed(1)} · feedback breaks close
								statistical ties.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-5 sm:grid-cols-2">
							{(["comfort", "control", "fatigue", "shakiness"] as const).map(
								(key) => (
									<Field key={key}>
										<div className="flex justify-between">
											<FieldLabel htmlFor={`feedback-${key}`}>
												{key.charAt(0).toUpperCase() + key.slice(1)}
											</FieldLabel>
											<span className="text-xs tabular-nums text-muted-foreground">
												{Math.round(feedback[key] * 100)}%
											</span>
										</div>
										<input
											id={`feedback-${key}`}
											type="range"
											min="0"
											max="1"
											step="0.05"
											value={feedback[key]}
											onChange={(event) =>
												setFeedback((current) => ({
													...current,
													[key]: Number(event.currentTarget.value),
												}))
											}
										/>
									</Field>
								),
							)}
						</CardContent>
						<CardFooter className="justify-end border-t">
							<Button size="lg" onClick={() => void submitFeedback()}>
								Save and continue
							</Button>
						</CardFooter>
					</Card>
				) : trial ? (
					<TrainerCanvas
						key={trial.id}
						trial={trial}
						baselineCmPer360={session.state.config.baselineCmPer360}
						inputMode={session.state.config.inputMode}
						seed={session.state.config.seed + session.state.completed.length}
						onComplete={(result) =>
							result.accepted ? setScored(result) : void recordInvalid(result)
						}
						onInvalid={(result) => void recordInvalid(result)}
					/>
				) : (
					<Alert>
						<AlertTitle>Recovering session</AlertTitle>
						<AlertDescription>
							No pending trial was found for this stage. Return home and resume;
							your completed trials remain saved.
						</AlertDescription>
					</Alert>
				)}
			</main>
		</AppShell>
	);
}
