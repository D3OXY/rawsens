import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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
import { Field, FieldLabel } from "#app/components/ui/field";
import { Input } from "#app/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#app/components/ui/select";
import { Separator } from "#app/components/ui/separator";
import { convertCmPer360 } from "../games/game-conversion";
import {
	type GameId,
	gameManifestById,
	gameManifests,
} from "../games/game-manifests";
import { ThemeToggle } from "./ThemeToggle";

const gameItems = gameManifests
	.filter((manifest) => manifest.id !== "generic")
	.map((manifest) => ({ label: manifest.displayName, value: manifest.id }));

export function GameConversions() {
	const [gameId, setGameId] = useState<GameId>("counter-strike-2");
	const [cmPer360, setCmPer360] = useState("40");
	const [dpi, setDpi] = useState("800");
	const [copied, setCopied] = useState<"game" | "generic" | null>(null);
	const manifest = gameManifestById(gameId);
	if (!manifest) throw new Error(`Missing game manifest: ${gameId}`);

	const result = useMemo(
		() => convertCmPer360(manifest, Number(cmPer360), Number(dpi)),
		[cmPer360, dpi, manifest],
	);

	const copyValue = async () => {
		if (!result.ok) return;
		await navigator.clipboard.writeText(result.displayValue);
		setCopied("game");
		window.setTimeout(() => setCopied(null), 1_500);
	};

	const copyGenericValue = async () => {
		const value = Number(cmPer360);
		if (!Number.isFinite(value) || value <= 0) return;
		await navigator.clipboard.writeText(value.toFixed(2));
		setCopied("generic");
		window.setTimeout(() => setCopied(null), 1_500);
	};

	return (
		<div className="min-h-screen bg-muted/30">
			<header className="border-b bg-background">
				<div className="mx-auto flex h-12 max-w-5xl items-center justify-between px-6">
					<Link
						to="/"
						className="text-sm font-semibold tracking-tight no-underline"
					>
						RawSens
					</Link>
					<div className="flex items-center gap-2">
						<Link
							to="/"
							className={buttonVariants({ variant: "ghost", size: "sm" })}
						>
							Home
						</Link>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
				<section className="max-w-2xl">
					<Badge variant="secondary">Game conversions</Badge>
					<h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
						Turn cm/360 into an exact game setting.
					</h1>
					<p className="mt-3 text-base/7 text-muted-foreground">
						Choose your game and mouse DPI. RawSens calculates a copyable value
						and shows where to enter it.
					</p>
				</section>

				<div className="mt-8 grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle>Convert</CardTitle>
							<CardDescription>
								Hip-fire horizontal sensitivity unless noted otherwise.
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-5">
							<Field>
								<FieldLabel htmlFor="game">Game</FieldLabel>
								<Select
									items={gameItems}
									value={gameId}
									onValueChange={(value) => {
										if (value) setGameId(value as GameId);
									}}
								>
									<SelectTrigger id="game" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{gameItems.map((game) => (
												<SelectItem key={game.value} value={game.value}>
													{game.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<div className="grid grid-cols-2 gap-4">
								<Field>
									<FieldLabel htmlFor="cm-per-360">cm/360</FieldLabel>
									<Input
										id="cm-per-360"
										type="number"
										min="0.01"
										step="0.01"
										value={cmPer360}
										onChange={(event) => setCmPer360(event.currentTarget.value)}
									/>
								</Field>
								<Field>
									<FieldLabel htmlFor="dpi">Mouse DPI</FieldLabel>
									<Input
										id="dpi"
										type="number"
										min="1"
										step="1"
										value={dpi}
										onChange={(event) => setDpi(event.currentTarget.value)}
									/>
								</Field>
							</div>
						</CardContent>
						<CardFooter className="border-t">
							<p className="text-xs text-muted-foreground">
								Conversions use the displayed game precision. No config files
								are read or changed.
							</p>
						</CardFooter>
					</Card>

					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle>{manifest.displayName}</CardTitle>
							<CardDescription>{manifest.settingLocation}</CardDescription>
						</CardHeader>
						<CardContent>
							{result.ok ? (
								<div className="rounded-md border bg-background p-5">
									<p className="text-sm text-muted-foreground">
										{manifest.settingLabel}
									</p>
									<div className="mt-2 flex flex-wrap items-end justify-between gap-4">
										<div>
											<span className="font-mono text-3xl font-semibold tracking-tight">
												{result.displayValue}
											</span>
											<span className="ml-2 text-sm text-muted-foreground">
												{result.unit}
											</span>
										</div>
										<Button type="button" onClick={() => void copyValue()}>
											{copied === "game" ? "Copied" : "Copy value"}
										</Button>
									</div>
									<p className="mt-3 text-xs text-muted-foreground">
										Effective sensitivity after rounding:{" "}
										{result.effectiveCmPer360.toFixed(2)} cm/360
									</p>
								</div>
							) : (
								<div className="rounded-md border border-dashed p-5">
									<Badge variant="outline">
										{result.code === "unverified"
											? "Not verified"
											: "Unavailable"}
									</Badge>
									<p className="mt-3 text-sm/6">{result.message}</p>
									<div className="mt-5 flex flex-wrap items-end justify-between gap-4 rounded-md bg-muted/60 p-4">
										<div>
											<p className="text-xs text-muted-foreground">
												Generic result
											</p>
											<p className="mt-1 font-mono text-xl font-semibold">
												{Number(cmPer360) > 0
													? `${Number(cmPer360).toFixed(2)} cm/360`
													: "Enter a valid cm/360"}
											</p>
										</div>
										<Button
											type="button"
											variant="outline"
											disabled={!(Number(cmPer360) > 0)}
											onClick={() => void copyGenericValue()}
										>
											{copied === "generic" ? "Copied" : "Copy cm/360"}
										</Button>
									</div>
								</div>
							)}
							<Instructions manifest={manifest} />
						</CardContent>
					</Card>
				</div>
			</main>
		</div>
	);
}

function Instructions({
	manifest,
}: {
	manifest: Exclude<ReturnType<typeof gameManifestById>, null>;
}) {
	return (
		<div className="mt-6">
			<Separator />
			<div className="mt-5 grid gap-6 sm:grid-cols-2">
				<div>
					<h2 className="text-sm font-medium">Set it manually</h2>
					<ol className="mt-3 list-decimal space-y-2 pl-4 text-sm/6 text-muted-foreground">
						{manifest.instructions.map((instruction) => (
							<li key={instruction}>{instruction}</li>
						))}
					</ol>
				</div>
				<div>
					<h2 className="text-sm font-medium">Assumptions</h2>
					<ul className="mt-3 list-disc space-y-2 pl-4 text-sm/6 text-muted-foreground">
						{manifest.assumptions.map((assumption) => (
							<li key={assumption}>{assumption}</li>
						))}
					</ul>
				</div>
			</div>
			<p className="mt-5 text-xs text-muted-foreground">
				Manifest v{manifest.manifestVersion} · Reviewed {manifest.verifiedAt}
			</p>
			{manifest.sources.length > 0 && (
				<div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-xs">
					{manifest.sources.map((source) => (
						<a
							key={source.url}
							href={source.url}
							target="_blank"
							rel="noreferrer"
							title={source.note}
							className="text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
						>
							{source.label}
						</a>
					))}
				</div>
			)}
		</div>
	);
}
