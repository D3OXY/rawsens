import type { SessionState } from "../domain/session-types";
import type {
	AiModelCatalog,
	AiPurpose,
	AiRunResult,
} from "../shared/ai-contract";
import type { CredentialState } from "../shared/local-data";
import { desktopRpc } from "./desktop-rpc";

const unavailableCredential: CredentialState = {
	openRouterConfigured: false,
	backend: "unavailable",
};

export const aiClient = {
	available: desktopRpc.isAvailable,
	credential: () =>
		desktopRpc.isAvailable
			? desktopRpc.request().getCredentialState({})
			: Promise.resolve(unavailableCredential),
	setKey: (key: string) => {
		if (!desktopRpc.isAvailable)
			throw new Error("AI setup requires the desktop app.");
		return desktopRpc.request().setOpenRouterKey({ key });
	},
	deleteKey: () => {
		if (!desktopRpc.isAvailable) return Promise.resolve(unavailableCredential);
		return desktopRpc.request().deleteOpenRouterKey({});
	},
	catalog: (refresh: boolean): Promise<AiModelCatalog> => {
		if (!desktopRpc.isAvailable)
			throw new Error("Model catalog requires the desktop app.");
		return desktopRpc.request().getAiModelCatalog({ refresh });
	},
	run: (
		requestId: string,
		purpose: AiPurpose,
		session: SessionState,
		userFeedback: string | null,
	): Promise<AiRunResult> => {
		if (!desktopRpc.isAvailable)
			throw new Error("AI assistance requires the desktop app.");
		return desktopRpc
			.request()
			.runAi({ requestId, purpose, session, userFeedback });
	},
	cancel: (requestId: string) =>
		desktopRpc.isAvailable
			? desktopRpc.request().cancelAiRequest({ requestId })
			: Promise.resolve({ cancelled: false }),
};
