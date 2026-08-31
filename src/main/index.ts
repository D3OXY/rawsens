import { BrowserView, BrowserWindow, Updater } from "electrobun/main";
import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "../shared/input-protocol";
import type { RawSensRPC, UpdateState } from "../shared/rpc";
import { InputController } from "./input-controller";
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
			downloadUpdate: () => controller.download(),
			getInputCapability: () => inputController.getCapability(),
			getUpdateState: () => controller.getState(),
			refreshInputCapability: () => inputController.restart(),
			requestInputPermission: () => inputController.requestPermission(),
			setUpdatePolicy: ({ policy }) => controller.setPolicy(policy),
			startInputCapture: () => inputController.startCapture(),
			stopInputCapture: () => inputController.stopCapture(),
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
