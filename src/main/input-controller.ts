import { resolve } from "node:path";
import { RESOURCES_FOLDER } from "electrobun/main/paths";
import {
	capabilityFromHelper,
	type InputCapability,
	type InputCaptureEvent,
	type InputPacket,
	type InputSample,
	type NativeHelperMessage,
	parseNativeHelperMessage,
} from "../shared/input-protocol";

type InputControllerEvents = {
	onCapability: (capability: InputCapability) => void;
	onCapture: (capture: InputCaptureEvent) => void;
	onPacket: (packet: InputPacket) => void;
};

const initialCapability: InputCapability = {
	platform:
		process.platform === "win32"
			? "windows"
			: process.platform === "darwin"
				? "macos"
				: "unsupported",
	activeMode: "compatibility-relative",
	nativeMode:
		process.platform === "win32"
			? "hardware-raw"
			: process.platform === "darwin"
				? "native-relative"
				: null,
	status: "checking",
	detail: "Checking native input support…",
	canRequestPermission: false,
};

export class InputController {
	#capability = initialCapability;
	#events: InputControllerEvents;
	#process: Bun.PipedSubprocess | null = null;
	#restartId = 0;
	#samples: InputSample[] = [];
	#flushTimer: ReturnType<typeof setTimeout> | null = null;
	#activeCapture: InputCaptureEvent | null = null;

	private constructor(events: InputControllerEvents) {
		this.#events = events;
	}

	static async create(events: InputControllerEvents): Promise<InputController> {
		const controller = new InputController(events);
		await controller.restart();
		return controller;
	}

	getCapability(): InputCapability {
		return this.#capability;
	}

	async restart(): Promise<InputCapability> {
		const restartId = ++this.#restartId;
		this.#stopProcess();
		this.#setCapability({
			...initialCapability,
			platform: this.#capability.platform,
			nativeMode: this.#capability.nativeMode,
		});

		if (process.platform !== "darwin" && process.platform !== "win32") {
			this.#setCapability({
				...this.#capability,
				status: "unsupported",
				detail: "Native input is supported on Windows and macOS.",
			});
			return this.#capability;
		}

		try {
			const helperName =
				process.platform === "win32"
					? "rawsens-input-helper.exe"
					: "rawsens-input-helper";
			const helperPath = resolve(RESOURCES_FOLDER, "app/bin", helperName);
			const helper = Bun.spawn({
				cmd: [helperPath],
				stdin: "pipe",
				stdout: "pipe",
				stderr: "pipe",
			});
			this.#process = helper;
			void this.#readOutput(helper, restartId);
			void this.#watchExit(helper, restartId);
		} catch (error) {
			this.#setError(
				`Native input helper could not start: ${errorMessage(error)}`,
			);
		}

		return this.#capability;
	}

	requestPermission(): InputCapability {
		if (this.#capability.canRequestPermission) {
			this.#send("request-permission");
		}
		return this.#capability;
	}

	startCapture(): InputCapability {
		if (this.#capability.status === "available") this.#send("start");
		return this.#capability;
	}

	stopCapture(): InputCapability {
		if (this.#activeCapture?.state === "started") this.#send("stop");
		return this.#capability;
	}

	#send(command: string): void {
		if (!this.#process || this.#process.killed) return;
		void this.#process.stdin.write(`${command}\n`);
		void this.#process.stdin.flush();
	}

	async #readOutput(
		helper: Bun.PipedSubprocess,
		restartId: number,
	): Promise<void> {
		const reader = helper.stdout.getReader();
		const decoder = new TextDecoder();
		let pending = "";
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				pending += decoder.decode(value, { stream: true });
				const lines = pending.split("\n");
				pending = lines.pop() ?? "";
				for (const line of lines) this.#handleLine(line, restartId);
			}
			pending += decoder.decode();
			if (pending.trim()) this.#handleLine(pending, restartId);
		} finally {
			reader.releaseLock();
		}
	}

	#handleLine(line: string, restartId: number): void {
		if (restartId !== this.#restartId) return;
		const message = parseNativeHelperMessage(line);
		if (!message) return;
		this.#handleMessage(message);
	}

	#handleMessage(message: NativeHelperMessage): void {
		switch (message.type) {
			case "capability": {
				const permissionWasRequired =
					this.#capability.status === "permission-required";
				this.#setCapability(capabilityFromHelper(message));
				if (permissionWasRequired && message.status === "available") {
					void this.restart();
				}
				return;
			}
			case "capture": {
				const capture: InputCaptureEvent = {
					state: message.state,
					captureId: message.captureId,
					timestampUs: message.timestampUs,
					mode: message.mode,
					reason: message.reason,
				};
				this.#activeCapture = capture;
				if (capture.state !== "started") this.#flushSamples();
				this.#events.onCapture(capture);
				if (capture.state === "lost") void this.restart();
				return;
			}
			case "move":
			case "button":
				if (
					this.#activeCapture?.state !== "started" ||
					message.captureId !== this.#activeCapture.captureId
				)
					return;
				this.#samples.push(message);
				if (!this.#flushTimer) {
					this.#flushTimer = setTimeout(() => this.#flushSamples(), 4);
				}
		}
	}

	#flushSamples(): void {
		if (this.#flushTimer) clearTimeout(this.#flushTimer);
		this.#flushTimer = null;
		const captureId = this.#samples[0]?.captureId;
		if (captureId === undefined) return;
		const samples = this.#samples;
		this.#samples = [];
		this.#events.onPacket({ captureId, samples });
	}

	async #watchExit(
		helper: Bun.PipedSubprocess,
		restartId: number,
	): Promise<void> {
		const exitCode = await helper.exited;
		if (restartId !== this.#restartId) return;
		this.#process = null;
		if (this.#activeCapture?.state === "started") {
			const capture: InputCaptureEvent = {
				...this.#activeCapture,
				state: "lost",
				reason: "native-helper-exited",
			};
			this.#activeCapture = capture;
			this.#events.onCapture(capture);
		}
		if (this.#capability.status === "checking") {
			this.#setError(`Native input helper exited with code ${exitCode}.`);
		}
	}

	#stopProcess(): void {
		this.#flushSamples();
		this.#activeCapture = null;
		if (!this.#process) return;
		this.#process.kill();
		this.#process = null;
	}

	#setError(detail: string): void {
		this.#setCapability({
			...this.#capability,
			activeMode: "compatibility-relative",
			status: "error",
			detail,
			canRequestPermission: false,
		});
	}

	#setCapability(capability: InputCapability): void {
		this.#capability = capability;
		this.#events.onCapability(capability);
	}
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}
