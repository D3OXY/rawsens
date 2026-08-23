import { ArrowLeft02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react";
import { Badge } from "#app/components/ui/badge";
import { Button, buttonVariants } from "#app/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import { ToggleGroup, ToggleGroupItem } from "#app/components/ui/toggle-group";
import {
	type AimDimension,
	aimDimensions,
	type ScoredTrial,
} from "../domain/calibration-types";
import type { TrialSpec } from "../domain/session-types";
import {
	formatInputMode,
	inputModeComparisonWarning,
} from "../shared/input-protocol";
import { dimensionLabels } from "./dimension-labels";
import { inputClient } from "./input-client";
import { ThemeToggle } from "./ThemeToggle";
import { TrainerCanvas } from "./TrainerCanvas";

function isAimDimension(value: string): value is AimDimension {
	return aimDimensions.some((dimension) => dimension === value);
}

export function TrainerPreview() {
	const [dimension, setDimension] = useState<AimDimension>("flicking");
	const [run, setRun] = useState(1);
	const [result, setResult] = useState<ScoredTrial | null>(null);
	const [error, setError] = useState<string | null>(null);
	const input = useSyncExternalStore(
		inputClient.subscribe,
		inputClient.getSnapshot,
		inputClient.getSnapshot,
	);

	useEffect(() => {
		void inputClient.initialize();
	}, []);
	const trial = useMemo<TrialSpec>(
		() => ({
			id: `preview-${dimension}-${run}`,
			stage: "screening",
			dimension,
			candidate: { id: "preview-40", cmPer360: 40 },
			durationMs: 12_000,
			blindLabel: null,
			attempt: run,
		}),
		[dimension, run],
	);
	const comparisonWarning = result?.accepted
		? inputModeComparisonWarning(result.observation.inputMode, input.activeMode)
		: null;

	const reset = useCallback((next: AimDimension) => {
		setDimension(next);
		setRun((value) => value + 1);
		setResult(null);
		setError(null);
	}, []);

	return (
		<div className="flex min-h-screen flex-col bg-muted/30">
			<header className="border-b bg-background">
				<div className="mx-auto flex min-h-12 max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-2">
					<Link to="/" className={buttonVariants({ variant: "ghost" })}>
						<HugeiconsIcon
							data-icon="inline-start"
							icon={ArrowLeft02Icon}
							strokeWidth={2}
						/>
						RawSens
					</Link>
					<ToggleGroup
						aria-label="Trial dimension"
						value={[dimension]}
						onValueChange={(values) => {
							const next = values.at(-1);
							if (next && isAimDimension(next)) reset(next);
						}}
						variant="outline"
						spacing={0}
					>
						{aimDimensions.map((entry) => (
							<ToggleGroupItem key={entry} value={entry}>
								{dimensionLabels[entry]}
							</ToggleGroupItem>
						))}
					</ToggleGroup>
					<div className="flex items-center gap-2">
						<Badge variant="outline">{formatInputMode(input.activeMode)}</Badge>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-3 p-4">
				<TrainerCanvas
					key={trial.id}
					trial={trial}
					baselineCmPer360={40}
					inputMode={input.activeMode}
					seed={9182 + run}
					onComplete={setResult}
					onInvalid={(invalid) => setError(invalid.issues.join(" / "))}
				/>

				{input.platform === "macos" &&
					input.status === "permission-required" && (
						<Card size="sm">
							<CardHeader>
								<CardTitle>Native input needs permission</CardTitle>
								<CardDescription>{input.detail}</CardDescription>
							</CardHeader>
							<CardContent className="flex flex-wrap gap-2 border-t pt-3">
								<Button
									type="button"
									onClick={() => void inputClient.requestPermission()}
								>
									Allow native input
								</Button>
								<Button
									type="button"
									variant="outline"
									onClick={() => void inputClient.refresh()}
								>
									Recheck
								</Button>
								<p className="basis-full text-muted-foreground">
									Compatibility input remains available without it.
								</p>
							</CardContent>
						</Card>
					)}

				<Card size="sm" aria-live="polite">
					<CardHeader>
						<CardTitle>Trial result</CardTitle>
						<CardDescription>
							{error
								? `Invalid: ${error}`
								: result
									? result.accepted
										? "Accepted observation"
										: `Rejected: ${result.issues.join(" / ")}`
									: "Complete the trial to see its score breakdown."}
						</CardDescription>
					</CardHeader>
					{result?.accepted && (
						<CardContent className="border-t pt-3">
							<div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
								<ResultMetric label="Score" value={result.score.toFixed(1)} />
								<ResultMetric
									label="Accuracy"
									value={Math.round(result.parts.accuracy * 100).toString()}
								/>
								<ResultMetric
									label="Precision"
									value={Math.round(result.parts.precision * 100).toString()}
								/>
								<ResultMetric
									label="Speed"
									value={Math.round(result.parts.speed * 100).toString()}
								/>
							</div>
							{comparisonWarning && (
								<p className="mt-3 border-t pt-3 text-amber-700 dark:text-amber-400">
									{comparisonWarning}
								</p>
							)}
						</CardContent>
					)}
				</Card>
			</main>
		</div>
	);
}

function ResultMetric({ label, value }: { label: string; value: string }) {
	return (
		<div>
			<p className="text-muted-foreground">{label}</p>
			<p className="mt-0.5 font-mono text-base font-medium">{value}</p>
		</div>
	);
}
