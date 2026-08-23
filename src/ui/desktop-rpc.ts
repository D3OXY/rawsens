import Electrobun, { Electroview } from "electrobun/view";
import type {
	InputCapability,
	InputCaptureEvent,
	InputPacket,
} from "../shared/input-protocol";
import type { RawSensRPC, UpdateState } from "../shared/rpc";

type MessageMap = {
	inputCapabilityChanged: InputCapability;
	inputCaptureChanged: InputCaptureEvent;
	inputPacket: InputPacket;
	updateStateChanged: UpdateState;
};

type MessageName = keyof MessageMap;
type MessageListener<Name extends MessageName> = (
	message: MessageMap[Name],
) => void;

const listeners: {
	[Name in MessageName]: Set<MessageListener<Name>>;
} = {
	inputCapabilityChanged: new Set(),
	inputCaptureChanged: new Set(),
	inputPacket: new Set(),
	updateStateChanged: new Set(),
};

function publish<Name extends MessageName>(
	name: Name,
	message: MessageMap[Name],
) {
	for (const listener of listeners[name]) listener(message);
}

const rpc = Electroview.defineRPC<RawSensRPC>({
	maxRequestTime: 30_000,
	handlers: {
		requests: {},
		messages: {
			inputCapabilityChanged: (message) =>
				publish("inputCapabilityChanged", message),
			inputCaptureChanged: (message) => publish("inputCaptureChanged", message),
			inputPacket: (message) => publish("inputPacket", message),
			updateStateChanged: (message) => publish("updateStateChanged", message),
		},
	},
});

const electrobun =
	"__electrobun" in window ? new Electrobun.Electroview({ rpc }) : null;

export const desktopRpc = {
	isAvailable: electrobun !== null,
	request() {
		if (!electrobun?.rpc) throw new Error("Electrobun RPC is unavailable");
		return electrobun.rpc.request;
	},
	subscribe<Name extends MessageName>(
		name: Name,
		listener: MessageListener<Name>,
	): () => void {
		listeners[name].add(listener);
		return () => listeners[name].delete(listener);
	},
};
