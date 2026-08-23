import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "#app/components/ui/alert";
import { Badge } from "#app/components/ui/badge";
import { Button } from "#app/components/ui/button";
import {
	Card,
	CardAction,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from "#app/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "#app/components/ui/dialog";
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
import {
	type AiModelSummary,
	aiDataDisclosure,
	maintainedAiModelPresets,
	sponsoredModelId,
} from "../shared/ai-contract";
import type { CredentialState } from "../shared/local-data";
import { type UpdatePolicy, updatePolicies } from "../shared/rpc";
import { AppShell } from "./AppShell";
import { aiClient } from "./ai-client";
import { sponsoredAiAvailability } from "./ai-copy";
import { localDataClient } from "./local-data-client";
import { updateClient } from "./update-client";

const policyLabels: Record<UpdatePolicy, string> = {
	manual: "Manual",
	notify: "Notify me",
	download: "Download, ask before install",
};

export function Settings() {
	const local = useSyncExternalStore(
		localDataClient.subscribe,
		localDataClient.getSnapshot,
		localDataClient.getSnapshot,
	);
	const update = useSyncExternalStore(
		updateClient.subscribe,
		updateClient.getSnapshot,
		updateClient.getSnapshot,
	);
	const importRef = useRef<HTMLInputElement>(null);
	const [credential, setCredential] = useState<CredentialState | null>(null);
	const [key, setKey] = useState("");
	const [customModel, setCustomModel] = useState("");
	const [models, setModels] = useState<readonly AiModelSummary[]>([]);
	const [message, setMessage] = useState<string | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [confirmInstall, setConfirmInstall] = useState(false);
	useEffect(() => {
		void localDataClient.initialize();
		void updateClient.initialize();
		void aiClient.credential().then(setCredential);
	}, []);
	const settings = local.data.settings;
	const saveAi = (patch: Partial<typeof settings.ai>) =>
		localDataClient.updateSettings({
			...settings,
			ai: { ...settings.ai, ...patch },
		});
	const setAccess = async (access: string) => {
		const enabled = access !== "disabled";
		await saveAi({
			enabled,
			access: access === "byok" ? "byok" : "free-proxy",
			modelId: access === "free-proxy" ? sponsoredModelId : settings.ai.modelId,
			disclosureAcceptedAt: enabled ? settings.ai.disclosureAcceptedAt : null,
		});
	};
	const saveKey = async () => {
		setError(null);
		try {
			setCredential(await aiClient.setKey(key.trim()));
			setKey("");
			setMessage("OpenRouter key saved.");
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const loadModels = async () => {
		setError(null);
		try {
			const catalog = await aiClient.catalog(true);
			setModels(catalog.models);
			setMessage(`${catalog.models.length} OpenRouter models loaded.`);
		} catch (cause) {
			setError(cause instanceof Error ? cause.message : String(cause));
		}
	};
	const exportData = async () => {
		const exported = await localDataClient.exportJson();
		const url = URL.createObjectURL(
			new Blob([exported.json], { type: "application/json" }),
		);
		const link = document.createElement("a");
		link.href = url;
		link.download = exported.suggestedName;
		link.click();
		URL.revokeObjectURL(url);
	};
	const modelItems = [
		...maintainedAiModelPresets.map((item) => ({
			label: item.name,
			value: item.id,
		})),
		...models
			.filter(
				(model) =>
					!maintainedAiModelPresets.some((preset) => preset.id === model.id),
			)
			.slice(0, 500)
			.map((model) => ({ label: model.name, value: model.id })),
	];
	return (
		<AppShell>
			<main className="mx-auto max-w-5xl px-6 py-10 sm:py-14">
				<div className="max-w-2xl">
					<Badge variant="secondary">Configuration</Badge>
					<h1 className="mt-4 text-3xl font-semibold tracking-tight">
						Settings
					</h1>
					<p className="mt-3 text-muted-foreground">
						AI, updates, and portable local history.
					</p>
				</div>
				<div className="mt-8 grid gap-4 lg:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle>AI assistance</CardTitle>
							<CardDescription>
								AI may add a bounded trial or explain a completed result. It
								never chooses the final sensitivity.
							</CardDescription>
							<CardAction>
								<Badge variant="outline">
									{settings.ai.enabled ? settings.ai.access : "off"}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="space-y-5">
							<Field>
								<FieldLabel htmlFor="ai-access">Access</FieldLabel>
								<Select
									items={[
										{ label: "Disabled", value: "disabled" },
										{ label: "Sponsored Ox Alpha", value: "free-proxy" },
										{ label: "OpenRouter BYOK", value: "byok" },
									]}
									value={settings.ai.enabled ? settings.ai.access : "disabled"}
									onValueChange={(value) => value && void setAccess(value)}
								>
									<SelectTrigger id="ai-access" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											<SelectItem value="disabled">Disabled</SelectItem>
											<SelectItem value="free-proxy">
												Sponsored Ox Alpha
											</SelectItem>
											<SelectItem value="byok">OpenRouter BYOK</SelectItem>
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
							{settings.ai.access === "free-proxy" && settings.ai.enabled && (
								<Alert>
									<AlertTitle>Free sponsored AI</AlertTitle>
									<AlertDescription>{sponsoredAiAvailability}</AlertDescription>
								</Alert>
							)}
							{settings.ai.access === "byok" && settings.ai.enabled && (
								<>
									<div className="grid gap-4 sm:grid-cols-2">
										<Field>
											<FieldLabel htmlFor="model-id">Model</FieldLabel>
											<Select
												items={modelItems}
												value={settings.ai.modelId}
												onValueChange={(value) =>
													value && void saveAi({ modelId: value })
												}
											>
												<SelectTrigger id="model-id" className="w-full">
													<SelectValue />
												</SelectTrigger>
												<SelectContent>
													<SelectGroup>
														{modelItems.map((model) => (
															<SelectItem key={model.value} value={model.value}>
																{model.label}
															</SelectItem>
														))}
													</SelectGroup>
												</SelectContent>
											</Select>
											<FieldDescription>
												You can load the current catalog or enter any OpenRouter
												model ID.
											</FieldDescription>
										</Field>
										<Field>
											<FieldLabel htmlFor="custom-model-id">
												Custom model ID
											</FieldLabel>
											<div className="flex gap-2">
												<Input
													id="custom-model-id"
													placeholder="provider/model"
													value={customModel}
													onChange={(event) =>
														setCustomModel(event.currentTarget.value)
													}
												/>
												<Button
													variant="outline"
													disabled={!customModel.trim()}
													onClick={() => {
														void saveAi({ modelId: customModel.trim() });
														setCustomModel("");
													}}
												>
													Use
												</Button>
											</div>
										</Field>
									</div>
									<Button
										variant="outline"
										onClick={() => void loadModels()}
										disabled={!aiClient.available}
									>
										Refresh OpenRouter catalog
									</Button>
									<Field>
										<FieldLabel htmlFor="api-key">OpenRouter key</FieldLabel>
										<div className="flex gap-2">
											<Input
												id="api-key"
												type="password"
												autoComplete="off"
												placeholder={
													credential?.openRouterConfigured
														? "Key configured"
														: "sk-or-v1-…"
												}
												value={key}
												onChange={(event) => setKey(event.currentTarget.value)}
											/>
											<Button
												disabled={!key.trim() || !aiClient.available}
												onClick={() => void saveKey()}
											>
												Save
											</Button>
										</div>
										<FieldDescription>
											Stored with{" "}
											{credential?.backend ?? "the desktop credential service"}
											{"; never included in exports."}
										</FieldDescription>
									</Field>
									{credential?.openRouterConfigured && (
										<Button
											variant="ghost"
											onClick={() =>
												void aiClient.deleteKey().then(setCredential)
											}
										>
											Remove saved key
										</Button>
									)}
								</>
							)}
							{settings.ai.enabled && (
								<Field orientation="horizontal">
									<FieldLabel htmlFor="disclosure">
										<Switch
											id="disclosure"
											checked={settings.ai.disclosureAcceptedAt !== null}
											onCheckedChange={(checked) =>
												void saveAi({
													disclosureAcceptedAt: checked
														? new Date().toISOString()
														: null,
												})
											}
										/>
										<span>
											Allow derived calibration data to be sent for AI requests.
										</span>
									</FieldLabel>
									<FieldDescription>
										{aiDataDisclosure.join(" · ")}
									</FieldDescription>
								</Field>
							)}
							{message && (
								<p role="status" className="text-sm text-muted-foreground">
									{message}
								</p>
							)}
							{error && <FieldError>{error}</FieldError>}
						</CardContent>
					</Card>
					<Card>
						<CardHeader>
							<CardTitle>App updates</CardTitle>
							<CardDescription>{update.message}</CardDescription>
							<CardAction>
								<Badge
									variant={update.phase === "error" ? "destructive" : "outline"}
								>
									v{update.currentVersion}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="space-y-5">
							<Alert>
								<AlertTitle>Unsigned desktop builds</AlertTitle>
								<AlertDescription>
									RawSens releases are not code-signed. Your OS may show a
									publisher warning. Updates are downloaded from GitHub Releases
									and are never installed without confirmation.
								</AlertDescription>
							</Alert>
							<Field>
								<FieldLabel htmlFor="update-policy">Update policy</FieldLabel>
								<Select
									items={updatePolicies.map((policy) => ({
										label: policyLabels[policy],
										value: policy,
									}))}
									value={update.policy}
									onValueChange={(value) =>
										value && void updateClient.setPolicy(value)
									}
								>
									<SelectTrigger id="update-policy" className="w-full">
										<SelectValue />
									</SelectTrigger>
									<SelectContent>
										<SelectGroup>
											{updatePolicies.map((policy) => (
												<SelectItem key={policy} value={policy}>
													{policyLabels[policy]}
												</SelectItem>
											))}
										</SelectGroup>
									</SelectContent>
								</Select>
							</Field>
						</CardContent>
						<CardFooter className="flex-wrap gap-2 border-t">
							<Button
								variant="outline"
								disabled={
									update.phase === "checking" || update.phase === "downloading"
								}
								onClick={() => void updateClient.check()}
							>
								Check now
							</Button>
							{update.phase === "available" && (
								<Button onClick={() => void updateClient.download()}>
									Download {update.latestVersion}
								</Button>
							)}
							{update.phase === "ready" && (
								<Button onClick={() => setConfirmInstall(true)}>
									Restart and install
								</Button>
							)}
						</CardFooter>
					</Card>
					<Card className="lg:col-span-2">
						<CardHeader>
							<CardTitle>Local data</CardTitle>
							<CardDescription>
								{local.message}. JSON exports contain settings, profiles, and
								sessions—never API keys.
							</CardDescription>
							<CardAction>
								<Badge variant="outline">
									Schema v{local.data.schemaVersion}
								</Badge>
							</CardAction>
						</CardHeader>
						<CardContent className="grid grid-cols-3 gap-4">
							<Stat label="Profiles" value={local.data.profiles.length} />
							<Stat label="Sessions" value={local.data.sessions.length} />
							<Stat
								label="Completed"
								value={
									local.data.sessions.filter(
										(session) => session.state.stage === "complete",
									).length
								}
							/>
						</CardContent>
						<CardFooter className="flex-wrap gap-2 border-t">
							<Button variant="outline" onClick={() => void exportData()}>
								Export JSON
							</Button>
							<Button
								variant="outline"
								onClick={() => importRef.current?.click()}
							>
								Import JSON
							</Button>
							<input
								ref={importRef}
								type="file"
								accept="application/json,.json"
								className="hidden"
								onChange={(event) => {
									const file = event.currentTarget.files?.[0];
									if (file)
										void file
											.text()
											.then((json) => localDataClient.importJson(json))
											.catch((cause: unknown) =>
												setError(
													cause instanceof Error
														? cause.message
														: String(cause),
												),
											);
									event.currentTarget.value = "";
								}}
							/>
						</CardFooter>
					</Card>
				</div>
			</main>
			<Dialog open={confirmInstall} onOpenChange={setConfirmInstall}>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>Restart and install update?</DialogTitle>
						<DialogDescription>
							RawSens will close, apply the downloaded unsigned GitHub release,
							and reopen. Save any other work first.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button variant="outline" onClick={() => setConfirmInstall(false)}>
							Cancel
						</Button>
						<Button onClick={() => void updateClient.apply()}>
							Restart and install
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</AppShell>
	);
}

function Stat({ label, value }: { label: string; value: number }) {
	return (
		<div>
			<p className="text-sm text-muted-foreground">{label}</p>
			<p className="mt-1 text-2xl font-semibold">{value}</p>
		</div>
	);
}
