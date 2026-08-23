import { useNavigate } from "@tanstack/react-router";
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
import {
	Field,
	FieldDescription,
	FieldError,
	FieldLabel,
} from "#app/components/ui/field";
import { Input } from "#app/components/ui/input";
import {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "#app/components/ui/select";
import { Switch } from "#app/components/ui/switch";
import { gameManifests } from "../games/game-manifests";
import {
	aiDataDisclosure,
	maintainedAiModelPresets,
	sponsoredModelId,
} from "../shared/ai-contract";
import { formatInputMode } from "../shared/input-protocol";
import { aiClient } from "./ai-client";
import { sponsoredAiAvailability } from "./ai-copy";
import { createProfileAndSession } from "./app-flow";
import { inputClient } from "./input-client";
import { localDataClient } from "./local-data-client";

const gameItems = gameManifests
	.filter((game) => game.id !== "generic")
	.map((game) => ({ label: game.displayName, value: game.id }));
const aiItems = [
	{ label: "Disabled", value: "disabled" },
	{ label: "Sponsored Ox Alpha", value: "free-proxy" },
	{ label: "Use my OpenRouter key", value: "byok" },
];

export function Onboarding() {
	const navigate = useNavigate();
	const input = useSyncExternalStore(
		inputClient.subscribe,
		inputClient.getSnapshot,
		inputClient.getSnapshot,
	);
	const data = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	const [name, setName] = useState("My setup");
	const [gameId, setGameId] = useState("counter-strike-2");
	const [dpi, setDpi] = useState("800");
	const [cm, setCm] = useState("40");
	const [aiMode, setAiMode] = useState("disabled");
	const [modelId, setModelId] = useState<string>(sponsoredModelId);
	const [customModelId, setCustomModelId] = useState("");
	const [key, setKey] = useState("");
	const [disclosure, setDisclosure] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [saving, setSaving] = useState(false);

	useEffect(() => {
		void inputClient.initialize();
	}, []);

	const submit = async () => {
		setError(null);
		if (aiMode !== "disabled" && !disclosure) {
			setError("Review and accept the AI data disclosure to enable AI.");
			return;
		}
		if (aiMode === "byok" && !key.trim()) {
			setError("Enter an OpenRouter key for BYOK mode.");
			return;
		}
		setSaving(true);
		try {
			const now = new Date().toISOString();
			const ids = {
				profileId: crypto.randomUUID(),
				sessionId: crypto.randomUUID(),
				now,
				seed: Date.now() % 2_147_483_647,
			};
			const created = createProfileAndSession(
				{
					profileName: name,
					gameId,
					dpi: Number(dpi),
					baselineCmPer360: Number(cm),
					inputMode: input.activeMode,
				},
				ids,
			);
			if (aiMode === "byok") await aiClient.setKey(key.trim());
			await localDataClient.upsertProfile(created.profile);
			await localDataClient.saveSession(created.session);
			await localDataClient.updateSettings({
				...data.data.settings,
				defaultProfileId: created.profile.id,
				ai: {
					enabled: aiMode !== "disabled",
					access: aiMode === "byok" ? "byok" : "free-proxy",
					modelId:
						aiMode === "free-proxy"
							? sponsoredModelId
							: customModelId.trim() || modelId,
					disclosureAcceptedAt: aiMode === "disabled" ? null : now,
				},
			});
			await navigate({
				to: "/session/$sessionId",
				params: { sessionId: created.session.id },
			});
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		} finally {
			setSaving(false);
		}
	};

	return (
		<main className="mx-auto max-w-3xl px-6 py-10 sm:py-14">
			<div className="mb-8 max-w-2xl">
				<Badge variant="secondary">First setup</Badge>
				<h1 className="mt-4 text-3xl font-semibold tracking-[-0.035em] sm:text-4xl">
					Calibrate from what you use today.
				</h1>
				<p className="mt-3 text-base/7 text-muted-foreground">
					Set a baseline, verify input, then RawSens will compare and validate
					candidates across four aim dimensions.
				</p>
			</div>
			<Card>
				<CardHeader>
					<CardTitle>Your setup</CardTitle>
					<CardDescription>You can change these later.</CardDescription>
				</CardHeader>
				<CardContent className="space-y-6">
					<div className="grid gap-4 sm:grid-cols-2">
						<Field>
							<FieldLabel htmlFor="profile-name">Profile name</FieldLabel>
							<Input
								id="profile-name"
								value={name}
								maxLength={80}
								onChange={(event) => setName(event.currentTarget.value)}
							/>
						</Field>
						<Field>
							<FieldLabel htmlFor="game">Game</FieldLabel>
							<Select
								items={gameItems}
								value={gameId}
								onValueChange={(value) => value && setGameId(value)}
							>
								<SelectTrigger id="game" className="w-full">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
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
						<Field>
							<FieldLabel htmlFor="dpi">Mouse DPI</FieldLabel>
							<Input
								id="dpi"
								type="number"
								min="100"
								max="32000"
								value={dpi}
								onChange={(event) => setDpi(event.currentTarget.value)}
							/>
							<FieldDescription>
								Use the DPI configured in your mouse software.
							</FieldDescription>
						</Field>
						<Field>
							<FieldLabel htmlFor="cm">Current cm/360</FieldLabel>
							<Input
								id="cm"
								type="number"
								min="5"
								max="150"
								step="0.1"
								value={cm}
								onChange={(event) => setCm(event.currentTarget.value)}
							/>
							<FieldDescription>
								Measure the desk distance for one full turn.
							</FieldDescription>
						</Field>
					</div>
					<div>
						<p className="mb-2 text-sm font-medium">Input verification</p>
						<Alert
							variant={
								input.activeMode === "compatibility-relative"
									? "destructive"
									: "default"
							}
						>
							<AlertTitle>{formatInputMode(input.activeMode)}</AlertTitle>
							<AlertDescription>
								{input.detail}{" "}
								{input.activeMode === "compatibility-relative" &&
									"Results can still be useful, but confidence is capped because OS acceleration or browser input may affect measurements."}
							</AlertDescription>
						</Alert>
						{input.canRequestPermission && (
							<Button
								className="mt-3"
								type="button"
								variant="outline"
								onClick={() => void inputClient.requestPermission()}
							>
								Allow native input
							</Button>
						)}
					</div>
					<Field>
						<FieldLabel htmlFor="ai-mode">AI assistance</FieldLabel>
						<Select
							items={aiItems}
							value={aiMode}
							onValueChange={(value) => value && setAiMode(value)}
						>
							<SelectTrigger id="ai-mode" className="w-full">
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								<SelectGroup>
									{aiItems.map((item) => (
										<SelectItem key={item.value} value={item.value}>
											{item.label}
										</SelectItem>
									))}
								</SelectGroup>
							</SelectContent>
						</Select>
						<FieldDescription>
							Optional. Deterministic scoring remains the authority.
						</FieldDescription>
					</Field>
					{aiMode === "free-proxy" && (
						<Alert>
							<AlertTitle>Free sponsored AI</AlertTitle>
							<AlertDescription>{sponsoredAiAvailability}</AlertDescription>
						</Alert>
					)}
					{aiMode === "byok" && (
						<div className="grid gap-4 sm:grid-cols-2">
							<Field>
								<FieldLabel htmlFor="model">OpenRouter model</FieldLabel>
								<Select
									items={maintainedAiModelPresets.map((item) => ({
										label: item.name,
										value: item.id,
									}))}
									value={modelId}
									onValueChange={(value) => value && setModelId(value)}
								>
									<SelectTrigger id="model" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{maintainedAiModelPresets.map((item) => (
												<SelectItem key={item.id} value={item.id}>
													{item.name}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							<Field>
								<FieldLabel htmlFor="custom-model">Or model ID</FieldLabel>
								<Input
									id="custom-model"
									placeholder="provider/model"
									value={customModelId}
									onChange={(event) =>
										setCustomModelId(event.currentTarget.value)
									}
								/>
							</Field>
							<Field className="sm:col-span-2">
								<FieldLabel htmlFor="openrouter-key">OpenRouter key</FieldLabel>
								<Input
									id="openrouter-key"
									type="password"
									autoComplete="off"
									value={key}
									onChange={(event) => setKey(event.currentTarget.value)}
								/>
								<FieldDescription>
									The key is stored by the desktop credential service, not in
									exported settings.
								</FieldDescription>
							</Field>
						</div>
					)}
					{aiMode !== "disabled" && (
						<Field orientation="horizontal">
							<FieldLabel htmlFor="ai-disclosure" className="items-start">
								<Switch
									id="ai-disclosure"
									checked={disclosure}
									onCheckedChange={setDisclosure}
								/>
								<span>
									Allow RawSens to send derived calibration data to the selected
									AI provider.
								</span>
							</FieldLabel>
							<FieldDescription>
								{aiDataDisclosure.join(" · ")}
							</FieldDescription>
						</Field>
					)}
					{error && <FieldError>{error}</FieldError>}
				</CardContent>
				<CardFooter className="justify-end border-t">
					<Button size="lg" disabled={saving} onClick={() => void submit()}>
						{saving ? "Creating…" : "Create profile and start"}
					</Button>
				</CardFooter>
			</Card>
		</main>
	);
}
