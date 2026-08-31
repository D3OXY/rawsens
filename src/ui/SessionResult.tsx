import { Link, useParams } from "@tanstack/react-router";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "#app/components/ui/alert";
import { Badge } from "#app/components/ui/badge";
import { Button, buttonVariants } from "#app/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import { Separator } from "#app/components/ui/separator";
import { AppShell } from "./AppShell";
import { aiClient } from "./ai-client";
import { dimensionLabels } from "./dimension-labels";
import { localDataClient } from "./local-data-client";

export function SessionResult() {
	const { sessionId } = useParams({ from: "/results/$sessionId" });
	const local = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	const session = local.data.sessions.find((item) => item.id === sessionId);
	const [explanation, setExplanation] = useState<string | null>(null);
	const [aiError, setAiError] = useState<string | null>(null);
	const [loadingAi, setLoadingAi] = useState(false);
	useEffect(() => {
		void localDataClient.initialize();
	}, []);
	if (!session?.state.result)
		return (
			<AppShell>
				<main className="mx-auto max-w-5xl px-6 py-16">
					<h1 className="text-xl font-semibold">Result unavailable</h1>
					<p className="mt-2 text-sm text-muted-foreground">
						This session is not complete or no longer exists.
					</p>
				</main>
			</AppShell>
		);
	const result = session.state.result;
	const profile = local.data.profiles.find(
		(item) => item.id === session.profileId,
	);
	const leader = result.candidates[0];
	const requestExplanation = async () => {
		setLoadingAi(true);
		setAiError(null);
		try {
			const response = await aiClient.run(
				crypto.randomUUID(),
				"explain-result",
				session.state,
				null,
			);
			if (response.status === "completed")
				setExplanation(
					`${response.response.explanation}\n\n${response.response.trainingRecommendation}`,
				);
			else setAiError(response.message);
		} catch (cause) {
			setAiError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setLoadingAi(false);
		}
	};
	return (
		<AppShell>
			<main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
				<div className="flex flex-wrap items-end justify-between gap-4">
					<div>
						<Badge
							variant={
								result.status === "recommended" ? "secondary" : "destructive"
							}
						>
							{result.status === "recommended"
								? "Validated recommendation"
								: "Inconclusive result"}
						</Badge>
						<h1 className="mt-4 text-3xl font-semibold tracking-tight">
							{result.central.cmPer360.toFixed(2)} cm/360
						</h1>
						<p className="mt-2 text-muted-foreground">
							Useful range {result.range.minCmPer360.toFixed(2)}–
							{result.range.maxCmPer360.toFixed(2)} cm/360
						</p>
					</div>
					<Badge variant="outline">{result.confidence.level} confidence</Badge>
				</div>
				{(result.confidence.level === "low" ||
					session.state.config.inputMode === "compatibility-relative") && (
					<Alert variant="destructive" className="mt-6 p-3">
						<AlertTitle>
							{result.confidence.level === "low"
								? "Do not treat this as a final setting"
								: "Compatibility input affected this result"}
						</AlertTitle>
						<AlertDescription>
							{result.confidence.level === "low"
								? "RawSens could not separate a stable winner. Repeat the session under consistent conditions."
								: "The recommendation is usable as a starting point, but native input can produce a more trustworthy comparison."}
						</AlertDescription>
					</Alert>
				)}
				<div className="mt-6 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
					<Card>
						<CardHeader>
							<CardTitle>Why this confidence</CardTitle>
							<CardDescription>
								Validation and repeatability determine confidence.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<ul className="list-disc space-y-2 pl-5 text-sm/6 text-muted-foreground">
								{result.confidence.reasons.length > 0 ? (
									result.confidence.reasons.map((reason) => (
										<li key={reason}>{reason}</li>
									))
								) : (
									<li>Repeated trials and blind validation agreed.</li>
								)}
							</ul>
							<Separator className="my-5" />
							<p className="text-sm">
								<span className="text-muted-foreground">
									Blind validation:{" "}
								</span>
								{session.state.leaderBeforeValidation === result.central.id
									? "confirmed the earlier leader"
									: "did not confirm the earlier leader"}
							</p>
							<p className="mt-2 text-sm">
								<span className="text-muted-foreground">Invalid trials: </span>
								{session.state.invalidTrials}
							</p>
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>Dimension tradeoffs</CardTitle>
							<CardDescription>
								Scores for the leading candidate. Higher is better.
							</CardDescription>
						</CardHeader>
						<CardContent className="grid gap-3 sm:grid-cols-2">
							{leader ? (
								Object.entries(leader.dimensions).map(([dimension, score]) => (
									<div key={dimension} className="rounded-lg border p-4">
										<p className="text-sm text-muted-foreground">
											{
												dimensionLabels[
													dimension as keyof typeof dimensionLabels
												]
											}
										</p>
										<p className="mt-1 text-2xl font-semibold tabular-nums">
											{score?.toFixed(1)}
										</p>
									</div>
								))
							) : (
								<p className="text-sm text-muted-foreground">
									No ranked candidates were retained.
								</p>
							)}
						</CardContent>
					</Card>
					{local.data.settings.ai.enabled && (
						<Card className="lg:col-span-2">
							<CardHeader>
								<CardTitle>AI interpretation</CardTitle>
								<CardDescription>
									Optional explanation only. It cannot replace the deterministic
									result above.
								</CardDescription>
							</CardHeader>
							<CardContent>
								{explanation ? (
									<p className="whitespace-pre-line text-sm/6">{explanation}</p>
								) : (
									<p className="text-sm text-muted-foreground">
										Ask the configured model to explain tradeoffs and suggest
										practice.
									</p>
								)}
								{aiError && (
									<p role="alert" className="mt-3 text-sm text-destructive">
										{aiError} You can retry or continue without AI.
									</p>
								)}
							</CardContent>
							<CardFooter className="border-t">
								<Button
									variant="outline"
									disabled={loadingAi || !aiClient.available}
									onClick={() => void requestExplanation()}
								>
									{loadingAi
										? "Explaining…"
										: explanation
											? "Regenerate"
											: "Explain with AI"}
								</Button>
							</CardFooter>
						</Card>
					)}
				</div>
				<div className="mt-6 flex flex-wrap gap-3">
					<Link
						className={buttonVariants()}
						to="/games"
						search={{ cm: result.central.cmPer360, dpi: profile?.dpi ?? 800 }}
					>
						Copy to a game
					</Link>
					<Link className={buttonVariants({ variant: "outline" })} to="/">
						Back home
					</Link>
				</div>
			</main>
		</AppShell>
	);
}
