import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "../shared/input-protocol";
import { desktopRpc } from "./desktop-rpc";

const webCapability: InputCapability = {
	platform: "web",
	activeMode: "compatibility-relative",
	nativeMode: null,
	status: "unsupported",
	detail: "Web preview uses Pointer Lock compatibility input.",
	canRequestPermission: false,
};

let capability = webCapability;
const capabilityListeners = new Set<() => void>();
const captureListeners = new Set<(capture: InputCaptureEvent) => void>();
const packetListeners = new Set<(packet: InputPacket) => void>();

function publishCapability(next: InputCapability): void {
	capability = next;
	for (const listener of capabilityListeners) listener();
}

desktopRpc.subscribe("inputCapabilityChanged", publishCapability);
desktopRpc.subscribe("inputCaptureChanged", (capture) => {
	for (const listener of captureListeners) listener(capture);
});
desktopRpc.subscribe("inputPacket", (packet) => {
	for (const listener of packetListeners) listener(packet);
});

export const inputClient = {
	getSnapshot: () => capability,
	initialize: async () => {
		if (!desktopRpc.isAvailable) return capability;
		const next = await desktopRpc.request().getInputCapability({});
		publishCapability(next);
		return next;
	},
	refresh: async () => {
		if (!desktopRpc.isAvailable) return capability;
		const next = await desktopRpc.request().refreshInputCapability({});
		publishCapability(next);
		return next;
	},
	requestPermission: async () => {
		if (!desktopRpc.isAvailable) return capability;
		const next = await desktopRpc.request().requestInputPermission({});
		publishCapability(next);
		return next;
	},
	startCapture: async () => {
		if (!desktopRpc.isAvailable) return capability;
		const next = await desktopRpc.request().startInputCapture({});
		publishCapability(next);
		return next;
	},
	stopCapture: async () => {
		if (!desktopRpc.isAvailable) return capability;
		const next = await desktopRpc.request().stopInputCapture({});
		publishCapability(next);
		return next;
	},
	subscribe: (listener: () => void) => {
		capabilityListeners.add(listener);
		return () => capabilityListeners.delete(listener);
	},
	subscribeCapture: (listener: (capture: InputCaptureEvent) => void) => {
		captureListeners.add(listener);
		return () => captureListeners.delete(listener);
	},
	subscribePacket: (listener: (packet: InputPacket) => void) => {
		packetListeners.add(listener);
		return () => packetListeners.delete(listener);
	},
};
