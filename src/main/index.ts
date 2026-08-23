import { BrowserView, BrowserWindow, Updater } from "electrobun/main";
import type { RawSensRPC, UpdateState } from "../shared/rpc";
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

const controller = await UpdateController.create((state) => {
	publishUpdate(state);
});

const rpc = BrowserView.defineRPC<RawSensRPC>({
	maxRequestTime: 30_000,
	handlers: {
		requests: {
			applyUpdate: () => controller.apply(),
			checkForUpdates: () => controller.check(),
			downloadUpdate: () => controller.download(),
			getUpdateState: () => controller.getState(),
			setUpdatePolicy: ({ policy }) => controller.setPolicy(policy),
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

mainWindow.webview.on("dom-ready", () => {
	mainWindow.webview.rpc?.send.updateStateChanged(controller.getState());
	void controller.runStartupPolicy();
});
