import { Link } from "@tanstack/react-router";
import { useEffect, useSyncExternalStore } from "react";
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
import { AppShell } from "./AppShell";
import { historyEntries } from "./app-flow";
import { localDataClient } from "./local-data-client";

export function History() {
	const local = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	useEffect(() => {
		void localDataClient.initialize();
	}, []);
	const entries = historyEntries(local.data);
	return (
		<AppShell>
			<main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
				<div className="max-w-2xl">
					<Badge variant="secondary">Local history</Badge>
					<h1 className="mt-4 text-3xl font-semibold tracking-tight">
						Sessions and comparisons
					</h1>
					<p className="mt-3 text-muted-foreground">
						Resume unfinished work or compare completed recommendations for the
						same profile.
					</p>
				</div>
				<div className="mt-8 space-y-3">
					{entries.length === 0 ? (
						<Card>
							<CardContent className="py-10 text-center text-sm text-muted-foreground">
								No sessions yet.
							</CardContent>
						</Card>
					) : (
						entries.map(
							({ session, profile, centralCmPer360, deltaFromPrevious }) => (
								<Card key={session.id}>
									<CardHeader>
										<CardTitle>
											{profile?.name ?? "Unassigned profile"}
										</CardTitle>
										<CardDescription>
											{new Date(session.createdAt).toLocaleString()} ·{" "}
											{session.state.completed.length} valid trials
										</CardDescription>
										<div className="absolute top-4 right-4">
											<Badge
												variant={
													session.state.stage === "complete"
														? "secondary"
														: "outline"
												}
											>
												{session.state.stage}
											</Badge>
										</div>
									</CardHeader>
									<CardContent>
										{centralCmPer360 !== null ? (
											<div className="flex flex-wrap items-baseline gap-3">
												<p className="font-mono text-2xl font-semibold">
													{centralCmPer360.toFixed(2)} cm/360
												</p>
												{deltaFromPrevious !== null && (
													<p className="text-sm text-muted-foreground">
														{deltaFromPrevious >= 0 ? "+" : ""}
														{deltaFromPrevious.toFixed(2)} from previous
													</p>
												)}
												<p className="text-sm text-muted-foreground">
													{session.state.result?.confidence.level} confidence
												</p>
											</div>
										) : (
											<p className="text-sm text-muted-foreground">
												Baseline{" "}
												{session.state.config.baselineCmPer360.toFixed(2)}{" "}
												cm/360
											</p>
										)}
									</CardContent>
									<CardFooter className="justify-between border-t">
										<Button
											variant="ghost"
											size="sm"
											onClick={() =>
												void localDataClient.removeSession(session.id)
											}
										>
											Delete
										</Button>
										{session.state.stage === "complete" ? (
											<Link
												className={buttonVariants({
													variant: "outline",
													size: "sm",
												})}
												to="/results/$sessionId"
												params={{ sessionId: session.id }}
											>
												View result
											</Link>
										) : session.state.stage !== "abandoned" ? (
											<Link
												className={buttonVariants({ size: "sm" })}
												to="/session/$sessionId"
												params={{ sessionId: session.id }}
											>
												Resume
											</Link>
										) : null}
									</CardFooter>
								</Card>
							),
						)
					)}
				</div>
			</main>
		</AppShell>
	);
}
