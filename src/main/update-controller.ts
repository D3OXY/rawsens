import { join } from "node:path";
import { Updater, Utils } from "electrobun/main";
import {
	type UpdatePolicy,
	type UpdateState,
	updatePolicies,
} from "../shared/rpc";

const settingsPath = join(Utils.paths.userData, "update-policy.json");

function isUpdatePolicy(value: unknown): value is UpdatePolicy {
	return updatePolicies.some((policy) => policy === value);
}

async function readPolicy(): Promise<UpdatePolicy> {
	try {
		const stored: unknown = await Bun.file(settingsPath).json();
		if (
			typeof stored === "object" &&
			stored !== null &&
			"policy" in stored &&
			isUpdatePolicy(stored.policy)
		) {
			return stored.policy;
		}
	} catch {
		// Missing or invalid settings fall back to the safest useful default.
	}

	return "notify";
}

export class UpdateController {
	readonly #publish: (state: UpdateState) => void;
	#state: UpdateState;

	private constructor(
		policy: UpdatePolicy,
		currentVersion: string,
		publish: (state: UpdateState) => void,
	) {
		this.#publish = publish;
		this.#state = {
			policy,
			phase: "idle",
			currentVersion,
			latestVersion: null,
			message:
				policy === "manual" ? "Update checks are manual" : "Ready to check",
		};

		Updater.onStatusChange((entry) => {
			this.#setState({ message: entry.message });
		});
	}

	static async create(
		publish: (state: UpdateState) => void,
	): Promise<UpdateController> {
		const [policy, local] = await Promise.all([
			readPolicy(),
			Updater.getLocalInfo(),
		]);
		return new UpdateController(policy, local.version, publish);
	}

	getState(): UpdateState {
		return this.#state;
	}

	async setPolicy(policy: UpdatePolicy): Promise<UpdateState> {
		await Bun.write(settingsPath, JSON.stringify({ policy }));
		this.#setState({ policy, message: `Update policy: ${policy}` });
		return this.#state;
	}

	async check(): Promise<UpdateState> {
		this.#setState({ phase: "checking", message: "Checking GitHub Releases…" });
		try {
			const update = await Updater.checkForUpdate();
			this.#setState({
				phase: update.updateAvailable ? "available" : "idle",
				latestVersion: update.updateAvailable ? update.version : null,
				message: update.updateAvailable
					? `RawSens ${update.version} is available`
					: "You are up to date",
			});
		} catch (error) {
			this.#setState({ phase: "error", message: String(error) });
		}
		return this.#state;
	}

	async download(): Promise<UpdateState> {
		this.#setState({ phase: "downloading", message: "Downloading update…" });
		try {
			await Updater.downloadUpdate();
			const update = Updater.updateInfo();
			this.#setState({
				phase: update.updateReady ? "ready" : "error",
				latestVersion: update.version,
				message: update.updateReady
					? "Update ready—restart to install"
					: update.error,
			});
		} catch (error) {
			this.#setState({ phase: "error", message: String(error) });
		}
		return this.#state;
	}

	async apply(): Promise<UpdateState> {
		this.#setState({ message: "Restarting into the update…" });
		try {
			await Updater.applyUpdate();
		} catch (error) {
			this.#setState({ phase: "error", message: String(error) });
		}
		return this.#state;
	}

	async runStartupPolicy(): Promise<void> {
		if (this.#state.policy === "manual") return;

		const checked = await this.check();
		if (checked.phase !== "available" || checked.policy === "notify") return;
		await this.download();
	}

	#setState(patch: Partial<UpdateState>): void {
		this.#state = { ...this.#state, ...patch };
		this.#publish(this.#state);
	}
}
