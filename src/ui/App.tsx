import {
	ArrowRight02Icon,
	Download04Icon,
	RefreshIcon,
	Target02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
import { Badge } from "#app/components/ui/badge";
import { Button, buttonVariants } from "#app/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import { Field, FieldLabel } from "#app/components/ui/field";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#app/components/ui/select";
import { Separator } from "#app/components/ui/separator";
import { type UpdatePolicy, updatePolicies } from "../shared/rpc";
import { ThemeToggle } from "./ThemeToggle";
import { updateClient } from "./update-client";

const policyLabels: Record<UpdatePolicy, string> = {
	manual: "Manual",
	notify: "Notify me",
	download: "Download",
	automatic: "Automatic",
};

const policyItems = updatePolicies.map((policy) => ({
	label: policyLabels[policy],
	value: policy,
}));

export function App() {
	const update = useSyncExternalStore(
		updateClient.subscribe,
		updateClient.getSnapshot,
		updateClient.getSnapshot,
	);

	useEffect(() => {
		void updateClient.initialize();
	}, []);

	const busy = update.phase === "checking" || update.phase === "downloading";

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
						<Badge variant="outline">v{update.currentVersion}</Badge>
						<ThemeToggle />
					</div>
				</div>
			</header>

			<main className="mx-auto max-w-5xl px-6 py-12 sm:py-16">
				<section className="max-w-2xl">
					<Badge variant="secondary">Open source sensitivity finder</Badge>
					<h1 className="mt-5 text-4xl font-semibold tracking-[-0.04em] sm:text-5xl">
						Find the sensitivity that holds up.
					</h1>
					<p className="mt-4 max-w-xl text-base/7 text-muted-foreground">
						RawSens measures flicking, tracking, switching, and micro
						corrections, then validates the result instead of trusting one lucky
						run.
					</p>
				</section>

				<div className="mt-10 grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle>Calibration</CardTitle>
							<CardDescription>
								A complete local trial across four aim dimensions.
							</CardDescription>
							<CardAction>
								<Badge variant="outline">Preview</Badge>
							</CardAction>
						</CardHeader>
						<CardContent>
							<div className="rounded-md border bg-muted/50 p-4">
								<div className="flex items-center gap-3">
									<div className="flex size-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
										<HugeiconsIcon icon={Target02Icon} strokeWidth={2} />
									</div>
									<div>
										<p className="font-medium">Trainer runtime ready</p>
										<p className="text-muted-foreground">
											12-second deterministic trial
										</p>
									</div>
								</div>
								<Separator className="my-4" />
								<div className="grid grid-cols-2 gap-4 text-muted-foreground sm:grid-cols-4">
									<span>Flicking</span>
									<span>Tracking</span>
									<span>Switching</span>
									<span>Micro</span>
								</div>
							</div>
						</CardContent>
						<CardFooter className="justify-between border-t">
							<p className="text-muted-foreground">
								Compatibility input on macOS
							</p>
							<Link to="/trainer" className={buttonVariants({ size: "lg" })}>
								Open trainer
								<HugeiconsIcon
									data-icon="inline-end"
									icon={ArrowRight02Icon}
									strokeWidth={2}
								/>
							</Link>
						</CardFooter>
					</Card>

					<Card className="shadow-sm">
						<CardHeader>
							<CardTitle>App updates</CardTitle>
							<CardDescription>{update.message}</CardDescription>
							<CardAction>
								<Badge
									variant={update.phase === "error" ? "destructive" : "outline"}
								>
									{update.phase}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent>
							<Field>
								<FieldLabel htmlFor="update-policy">Update policy</FieldLabel>
								<Select
									items={policyItems}
									value={update.policy}
									onValueChange={(policy) => {
										if (policy) void updateClient.setPolicy(policy);
									}}
								>
									<SelectTrigger id="update-policy" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent alignItemWithTrigger={false}>
										<SelectGroup>
											{policyItems.map((policy) => (
												<SelectItem key={policy.value} value={policy.value}>
													{policy.label}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						</CardContent>
						<CardFooter className="flex-wrap gap-2 border-t">
							<Button
								type="button"
								variant="outline"
								disabled={busy}
								onClick={() => void updateClient.check()}
							>
								<HugeiconsIcon
									data-icon="inline-start"
									icon={RefreshIcon}
									strokeWidth={2}
								/>
								Check now
							</Button>
							{update.phase === "available" && (
								<Button
									type="button"
									onClick={() => void updateClient.download()}
								>
									<HugeiconsIcon
										data-icon="inline-start"
										icon={Download04Icon}
										strokeWidth={2}
									/>
									Download {update.latestVersion}
								</Button>
							)}
							{update.phase === "ready" && (
								<Button type="button" onClick={() => void updateClient.apply()}>
									Restart and install
								</Button>
							)}
						</CardFooter>
					</Card>
				</div>
			</main>

			<footer className="mx-auto flex max-w-5xl items-center gap-3 px-6 pb-8 text-xs text-muted-foreground">
				<span>No account</span>
				<span aria-hidden="true">·</span>
				<span>AGPL-3.0</span>
			</footer>
		</div>
	);
}
