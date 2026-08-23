import { dlopen, type Pointer, ptr, read, toBuffer } from "bun:ffi";
import { access, mkdir, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { CredentialState } from "../shared/local-data";
import { localDataDirectory } from "./local-repository";

export interface CredentialVault {
	getState(): Promise<CredentialState>;
	getOpenRouterKey(): Promise<string | null>;
	setOpenRouterKey(key: string): Promise<CredentialState>;
	deleteOpenRouterKey(): Promise<CredentialState>;
}

const service = "dev.d3oxy.rawsens.openrouter";
const account = "rawsens";

export function createCredentialVault(
	directory = localDataDirectory(),
): CredentialVault {
	if (process.platform === "darwin") return new MacKeychainVault();
	if (process.platform === "win32") return new WindowsDpapiVault(directory);
	return new UnavailableVault();
}

class MacKeychainVault implements CredentialVault {
	async getState(): Promise<CredentialState> {
		const item = findMacKeychainItem();
		if (item) freeMacKeychainItem(item);
		return {
			openRouterConfigured: item !== null,
			backend: "macos-keychain",
		};
	}

	async getOpenRouterKey(): Promise<string | null> {
		const item = findMacKeychainItem();
		if (!item) return null;
		try {
			return new TextDecoder().decode(
				toBuffer(item.passwordData, 0, item.passwordLength),
			);
		} finally {
			freeMacKeychainItem(item);
		}
	}

	async setOpenRouterKey(key: string): Promise<CredentialState> {
		assertKey(key);
		const keyBytes = new TextEncoder().encode(key);
		const existing = findMacKeychainItem();
		try {
			const status = existing
				? macLibraries().security.symbols.SecKeychainItemModifyAttributesAndData(
						existing.item,
						null,
						keyBytes.byteLength,
						keyBytes,
					)
				: addMacKeychainItem(keyBytes);
			if (status !== 0) {
				throw new Error(
					`macOS Keychain rejected the OpenRouter credential (${status}).`,
				);
			}
		} finally {
			keyBytes.fill(0);
			if (existing) freeMacKeychainItem(existing);
		}
		return { openRouterConfigured: true, backend: "macos-keychain" };
	}

	async deleteOpenRouterKey(): Promise<CredentialState> {
		const existing = findMacKeychainItem();
		if (existing) {
			try {
				const status = macLibraries().security.symbols.SecKeychainItemDelete(
					existing.item,
				);
				if (status !== 0) {
					throw new Error(
						`macOS Keychain could not delete the credential (${status}).`,
					);
				}
			} finally {
				freeMacKeychainItem(existing);
			}
		}
		return { openRouterConfigured: false, backend: "macos-keychain" };
	}
}

type MacKeychainItem = {
	item: Pointer;
	passwordData: Pointer;
	passwordLength: number;
};

function findMacKeychainItem(): MacKeychainItem | null {
	const serviceBytes = new TextEncoder().encode(service);
	const accountBytes = new TextEncoder().encode(account);
	const passwordLength = new Uint32Array(1);
	const passwordData = new BigUint64Array(1);
	const item = new BigUint64Array(1);
	const status = macLibraries().security.symbols.SecKeychainFindGenericPassword(
		null,
		serviceBytes.byteLength,
		serviceBytes,
		accountBytes.byteLength,
		accountBytes,
		passwordLength,
		passwordData,
		item,
	);
	if (status === -25_300) return null;
	if (status !== 0) {
		throw new Error(
			`macOS Keychain could not read the credential (${status}).`,
		);
	}
	const passwordPointer = pointerFromStorage(passwordData);
	const itemPointer = pointerFromStorage(item);
	if (!passwordPointer || !itemPointer) {
		throw new Error("macOS Keychain returned an invalid credential item.");
	}
	return {
		item: itemPointer,
		passwordData: passwordPointer,
		passwordLength: passwordLength[0] ?? 0,
	};
}

function addMacKeychainItem(keyBytes: Uint8Array): number {
	const serviceBytes = new TextEncoder().encode(service);
	const accountBytes = new TextEncoder().encode(account);
	const item = new BigUint64Array(1);
	const status = macLibraries().security.symbols.SecKeychainAddGenericPassword(
		null,
		serviceBytes.byteLength,
		serviceBytes,
		accountBytes.byteLength,
		accountBytes,
		keyBytes.byteLength,
		keyBytes,
		item,
	);
	const itemPointer = pointerFromStorage(item);
	if (itemPointer) macLibraries().coreFoundation.symbols.CFRelease(itemPointer);
	return status;
}

function freeMacKeychainItem(item: MacKeychainItem): void {
	macLibraries().security.symbols.SecKeychainItemFreeContent(
		null,
		item.passwordData,
	);
	macLibraries().coreFoundation.symbols.CFRelease(item.item);
}

function pointerFromStorage(storage: BigUint64Array): Pointer | null {
	const address = read.ptr(ptr(storage));
	return address === 0 ? null : (address as Pointer);
}

function openMacLibraries() {
	return {
		security: dlopen("/System/Library/Frameworks/Security.framework/Security", {
			SecKeychainFindGenericPassword: {
				args: ["ptr", "u32", "ptr", "u32", "ptr", "ptr", "ptr", "ptr"],
				returns: "i32",
			},
			SecKeychainAddGenericPassword: {
				args: ["ptr", "u32", "ptr", "u32", "ptr", "u32", "ptr", "ptr"],
				returns: "i32",
			},
			SecKeychainItemModifyAttributesAndData: {
				args: ["ptr", "ptr", "u32", "ptr"],
				returns: "i32",
			},
			SecKeychainItemDelete: { args: ["ptr"], returns: "i32" },
			SecKeychainItemFreeContent: {
				args: ["ptr", "ptr"],
				returns: "i32",
			},
		}),
		coreFoundation: dlopen(
			"/System/Library/Frameworks/CoreFoundation.framework/CoreFoundation",
			{
				CFRelease: { args: ["ptr"], returns: "void" },
			},
		),
	};
}

type MacLibraries = ReturnType<typeof openMacLibraries>;
let loadedMacLibraries: MacLibraries | null = null;

function macLibraries(): MacLibraries {
	loadedMacLibraries ??= openMacLibraries();
	return loadedMacLibraries;
}

class WindowsDpapiVault implements CredentialVault {
	readonly #path: string;

	constructor(directory: string) {
		this.#path = join(directory, "openrouter.dpapi");
	}

	async getState(): Promise<CredentialState> {
		return {
			openRouterConfigured: await fileExists(this.#path),
			backend: "windows-dpapi",
		};
	}

	async getOpenRouterKey(): Promise<string | null> {
		if (!(await fileExists(this.#path))) return null;
		const result = await runPowershell(
			"$encrypted=[IO.File]::ReadAllBytes($env:RAWSENS_VAULT_PATH);$bytes=[Security.Cryptography.ProtectedData]::Unprotect($encrypted,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[Console]::Out.Write([Text.Encoding]::UTF8.GetString($bytes))",
			this.#path,
		);
		if (result.exitCode !== 0) {
			throw new Error("Windows could not decrypt the OpenRouter credential.");
		}
		return result.stdout;
	}

	async setOpenRouterKey(key: string): Promise<CredentialState> {
		assertKey(key);
		await mkdir(dirname(this.#path), { recursive: true });
		const result = await runPowershell(
			"$key=[Console]::In.ReadToEnd();$bytes=[Text.Encoding]::UTF8.GetBytes($key);$encrypted=[Security.Cryptography.ProtectedData]::Protect($bytes,$null,[Security.Cryptography.DataProtectionScope]::CurrentUser);[IO.File]::WriteAllBytes($env:RAWSENS_VAULT_PATH,$encrypted)",
			this.#path,
			key,
		);
		if (result.exitCode !== 0) {
			throw new Error("Windows could not protect the OpenRouter credential.");
		}
		return { openRouterConfigured: true, backend: "windows-dpapi" };
	}

	async deleteOpenRouterKey(): Promise<CredentialState> {
		await rm(this.#path, { force: true });
		return { openRouterConfigured: false, backend: "windows-dpapi" };
	}
}

class UnavailableVault implements CredentialVault {
	async getState(): Promise<CredentialState> {
		return { openRouterConfigured: false, backend: "unavailable" };
	}

	async getOpenRouterKey(): Promise<null> {
		return null;
	}

	async setOpenRouterKey(_key: string): Promise<CredentialState> {
		throw new Error("Credential storage is available on Windows and macOS.");
	}

	async deleteOpenRouterKey(): Promise<CredentialState> {
		return this.getState();
	}
}

async function runPowershell(
	script: string,
	path: string,
	stdin?: string,
): Promise<CommandResult> {
	return runCommand(
		[
			"powershell.exe",
			"-NoLogo",
			"-NoProfile",
			"-NonInteractive",
			"-Command",
			script,
		],
		stdin,
		{ ...process.env, RAWSENS_VAULT_PATH: path },
	);
}

type CommandResult = {
	exitCode: number;
	stdout: string;
};

async function runCommand(
	command: readonly string[],
	stdin?: string,
	env?: Record<string, string | undefined>,
): Promise<CommandResult> {
	const process = Bun.spawn({
		cmd: [...command],
		stdin: "pipe",
		stdout: "pipe",
		stderr: "pipe",
		env,
	});
	if (stdin !== undefined) process.stdin.write(stdin);
	process.stdin.end();
	const [exitCode, stdout] = await Promise.all([
		process.exited,
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
	]);
	return { exitCode, stdout };
}

function assertKey(key: string): void {
	if (!key.trim() || key.length > 4_096) {
		throw new Error("OpenRouter key must be between 1 and 4096 characters.");
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		await access(path);
		return true;
	} catch {
		return false;
	}
}
