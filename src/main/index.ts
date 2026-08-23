import { BrowserView, BrowserWindow, Updater } from "electrobun/main";
import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "../shared/input-protocol";
import type { RawSensRPC, UpdateState } from "../shared/rpc";
import { createCredentialVault } from "./credential-vault";
import { InputController } from "./input-controller";
import { LocalRepository } from "./local-repository";
import { UpdateController } from "./update-controller";

const devServerUrl = "http://127.0.0.1:5173";

async function getMainViewUrl(): Promise<string> {
	if ((await Updater.localInfo.channel()) !== "dev")
		return "views://main/index.html";

	try {
		await fetch(devServerUrl, { method: "HEAD" });
		return devServerUrl;
	} catch {
		return "views://main/index.html";
	}
}

let publishUpdate = (_state: UpdateState): void => {};
let publishInputCapability = (_capability: InputCapability): void => {};
let publishInputCapture = (_capture: InputCaptureEvent): void => {};
let publishInputPacket = (_packet: InputPacket): void => {};

const controller = await UpdateController.create((state) => {
	publishUpdate(state);
});
const repository = await LocalRepository.open();
const credentialVault = createCredentialVault();
const inputController = await InputController.create({
	onCapability: (capability) => publishInputCapability(capability),
	onCapture: (capture) => publishInputCapture(capture),
	onPacket: (packet) => publishInputPacket(packet),
});

const rpc = BrowserView.defineRPC<RawSensRPC>({
	maxRequestTime: 30_000,
	handlers: {
		requests: {
			applyUpdate: () => controller.apply(),
			checkForUpdates: () => controller.check(),
			deleteOpenRouterKey: () => credentialVault.deleteOpenRouterKey(),
			downloadUpdate: () => controller.download(),
			exportLocalData: () => ({
				json: repository.exportJson(),
				suggestedName: `rawsens-${new Date().toISOString().slice(0, 10)}.json`,
			}),
			getCredentialState: () => credentialVault.getState(),
			getInputCapability: () => inputController.getCapability(),
			getLocalData: () => repository.getSnapshot(),
			getUpdateState: () => controller.getState(),
			importLocalData: ({ json }) => repository.importJson(json),
			refreshInputCapability: () => inputController.restart(),
			removeProfile: ({ profileId }) => repository.removeProfile(profileId),
			removeSession: ({ sessionId }) => repository.removeSession(sessionId),
			requestInputPermission: () => inputController.requestPermission(),
			saveLocalSettings: ({ settings }) => repository.updateSettings(settings),
			saveSession: ({ session }) => repository.saveSession(session),
			setOpenRouterKey: ({ key }) => credentialVault.setOpenRouterKey(key),
			setUpdatePolicy: async ({ policy }) => {
				await repository.updateSettings({
					...repository.getSnapshot().settings,
					updatePolicy: policy,
				});
				return controller.setPolicy(policy);
			},
			startInputCapture: () => inputController.startCapture(),
			stopInputCapture: () => inputController.stopCapture(),
			upsertProfile: ({ profile }) => repository.upsertProfile(profile),
		},
		messages: {},
	},
});

const mainWindow = new BrowserWindow({
	title: "RawSens",
	url: await getMainViewUrl(),
	rpc,
	frame: {
		width: 1080,
		height: 720,
		x: 160,
		y: 100,
	},
});

publishUpdate = (state) => {
	mainWindow.webview.rpc?.send.updateStateChanged(state);
};
publishInputCapability = (capability) => {
	mainWindow.webview.rpc?.send.inputCapabilityChanged(capability);
};
publishInputCapture = (capture) => {
	mainWindow.webview.rpc?.send.inputCaptureChanged(capture);
};
publishInputPacket = (packet) => {
	mainWindow.webview.rpc?.send.inputPacket(packet);
};

mainWindow.webview.on("dom-ready", () => {
	mainWindow.webview.rpc?.send.updateStateChanged(controller.getState());
	mainWindow.webview.rpc?.send.inputCapabilityChanged(
		inputController.getCapability(),
	);
	void controller.runStartupPolicy();
});
