import { Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { Badge } from "#app/components/ui/badge";
import { buttonVariants } from "#app/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import { AppShell } from "./AppShell";
import {
	createProfileAndSession,
	historyEntries,
	sessionProgress,
} from "./app-flow";
import { inputClient } from "./input-client";
import { localDataClient } from "./local-data-client";
import { Onboarding } from "./Onboarding";

export function App() {
	const navigate = useNavigate();
	const local = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	const input = useSyncExternalStore(
		inputClient.subscribe,
		inputClient.getSnapshot,
		inputClient.getSnapshot,
	);
	useEffect(() => {
		void localDataClient.initialize();
		void inputClient.initialize();
	}, []);

	if (local.phase === "loading")
		return (
			<AppShell>
				<main className="mx-auto max-w-5xl px-6 py-16 text-sm text-muted-foreground">
					Loading your setup…
				</main>
			</AppShell>
		);
	if (local.data.profiles.length === 0)
		return (
			<AppShell>
				<Onboarding />
			</AppShell>
		);

	const profile =
		local.data.profiles.find(
			(item) => item.id === local.data.settings.defaultProfileId,
		) ?? local.data.profiles[0];
	if (!profile) return null;
	const entries = historyEntries(local.data);
	const active = entries.find(
		(entry) =>
			entry.session.profileId === profile.id &&
			!["complete", "abandoned"].includes(entry.session.state.stage),
	);
	const latestComplete = entries.find(
		(entry) =>
			entry.session.profileId === profile.id &&
			entry.session.state.stage === "complete",
	);

	const start = async () => {
		const now = new Date().toISOString();
		const sessionId = crypto.randomUUID();
		const { session } = createProfileAndSession(
			{
				profileName: profile.name,
				gameId: profile.gameId ?? "generic",
				dpi: profile.dpi,
				baselineCmPer360: profile.lastCmPer360 ?? 40,
				inputMode: input.activeMode,
			},
			{
				profileId: profile.id,
				sessionId,
				now,
				seed: Date.now() % 2_147_483_647,
			},
		);
		await localDataClient.saveSession(session);
		await navigate({ to: "/session/$sessionId", params: { sessionId } });
	};

	return (
		<AppShell>
			<main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
				<section className="max-w-2xl">
					<Badge variant="secondary">{profile.name}</Badge>
					<h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						Find the sensitivity that holds up.
					</h1>
					<p className="mt-3 text-base/7 text-muted-foreground">
						Compare flicking, tracking, switching, and micro-corrections—then
						validate the leader blind.
					</p>
				</section>
				<div className="mt-8 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
					<Card>
						<CardHeader>
							<CardTitle>
								{active ? "Calibration in progress" : "Start a calibration"}
							</CardTitle>
							<CardDescription>
								{active
									? `${active.session.state.stage} · ${active.session.state.completed.length} trials complete`
									: `Baseline ${profile.lastCmPer360?.toFixed(1) ?? "40.0"} cm/360 · ${profile.dpi} DPI`}
							</CardDescription>
							{active && (
								<CardAction>
									<Badge variant="outline">
										{sessionProgress(active.session.state)}%
									</Badge>
								</CardAction>
							)}
						</CardHeader>
						<CardContent>
							<div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
								{["Flicking", "Tracking", "Switching", "Micro"].map((label) => (
									<div key={label} className="bg-background p-4 text-sm">
										{label}
									</div>
								))}
							</div>
						</CardContent>
						<CardFooter className="justify-end border-t">
							{active ? (
								<Link
									className={buttonVariants({ size: "lg" })}
									to="/session/$sessionId"
									params={{ sessionId: active.session.id }}
								>
									Resume session
								</Link>
							) : (
								<button
									type="button"
									className={buttonVariants({ size: "lg" })}
									onClick={() => void start()}
								>
									Start full calibration
								</button>
							)}
						</CardFooter>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Latest result</CardTitle>
							<CardDescription>
								{latestComplete
									? new Date(
											latestComplete.session.updatedAt,
										).toLocaleDateString()
									: "No completed sessions yet"}
							</CardDescription>
						</CardHeader>
						<CardContent>
							{latestComplete?.centralCmPer360 ? (
								<>
									<p className="font-mono text-4xl font-semibold">
										{latestComplete.centralCmPer360.toFixed(2)}
									</p>
									<p className="mt-1 text-sm text-muted-foreground">
										cm/360 ·{" "}
										{latestComplete.session.state.result?.confidence.level}{" "}
										confidence
									</p>
								</>
							) : (
								<p className="text-sm text-muted-foreground">
									Finish your first session to establish a validated range.
								</p>
							)}
						</CardContent>
						{latestComplete && (
							<CardFooter className="border-t">
								<Link
									className={buttonVariants({ variant: "outline" })}
									to="/results/$sessionId"
									params={{ sessionId: latestComplete.session.id }}
								>
									View result
								</Link>
							</CardFooter>
						)}
					</Card>
				</div>
			</main>
		</AppShell>
	);
}
