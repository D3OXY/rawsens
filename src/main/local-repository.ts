import { copyFile, mkdir, open, readFile, rename, rm } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
	emptyLocalData,
	exportLocalData,
	importLocalData,
	type LocalData,
	type LocalSettings,
	type Profile,
	parseLocalData,
	type StoredSession,
} from "../shared/local-data";

const currentFileName = "data.json";
const backupFileName = "data.backup.json";

export class LocalRepository {
	readonly #directory: string;
	#data: LocalData;
	#writeQueue = Promise.resolve();

	private constructor(directory: string, data: LocalData) {
		this.#directory = directory;
		this.#data = data;
	}

	static async open(
		directory = localDataDirectory(),
	): Promise<LocalRepository> {
		await mkdir(directory, { recursive: true });
		const currentPath = join(directory, currentFileName);
		const backupPath = join(directory, backupFileName);
		const current = await readDataFile(currentPath);
		if (current) return new LocalRepository(directory, current);

		const backup = await readDataFile(backupPath);
		if (backup) {
			await writeAtomic(currentPath, serialize(backup));
			return new LocalRepository(directory, backup);
		}

		const currentExists = await fileExists(currentPath);
		const backupExists = await fileExists(backupPath);
		if (currentExists || backupExists) {
			throw new Error(
				"RawSens local data and its recovery copy are unreadable. The files were left untouched.",
			);
		}
		return new LocalRepository(directory, emptyLocalData());
	}

	getSnapshot(): LocalData {
		return structuredClone(this.#data);
	}

	async updateSettings(settings: LocalSettings): Promise<LocalData> {
		return this.#mutate((data) => ({ ...data, settings }));
	}

	async upsertProfile(profile: Profile): Promise<LocalData> {
		return this.#mutate((data) => ({
			...data,
			profiles: replaceById(data.profiles, profile),
		}));
	}

	async removeProfile(profileId: string): Promise<LocalData> {
		return this.#mutate((data) => ({
			...data,
			settings: {
				...data.settings,
				defaultProfileId:
					data.settings.defaultProfileId === profileId
						? null
						: data.settings.defaultProfileId,
			},
			profiles: data.profiles.filter((profile) => profile.id !== profileId),
			sessions: data.sessions.map((session) =>
				session.profileId === profileId
					? { ...session, profileId: null }
					: session,
			),
		}));
	}

	async saveSession(session: StoredSession): Promise<LocalData> {
		return this.#mutate((data) => ({
			...data,
			sessions: replaceById(data.sessions, session),
		}));
	}

	async removeSession(sessionId: string): Promise<LocalData> {
		return this.#mutate((data) => ({
			...data,
			sessions: data.sessions.filter((session) => session.id !== sessionId),
		}));
	}

	exportJson(): string {
		return exportLocalData(this.#data);
	}

	async importJson(json: string): Promise<LocalData> {
		const imported = importLocalData(json);
		return this.#mutate(() => imported);
	}

	async #mutate(update: (data: LocalData) => LocalData): Promise<LocalData> {
		let result: LocalData | null = null;
		const write = async () => {
			const validated = parseLocalData(update(this.#data));
			const currentPath = join(this.#directory, currentFileName);
			const backupPath = join(this.#directory, backupFileName);
			if (await readDataFile(currentPath)) {
				await copyAtomic(currentPath, backupPath);
			}
			await writeAtomic(currentPath, serialize(validated));
			this.#data = validated;
			result = this.getSnapshot();
		};
		this.#writeQueue = this.#writeQueue.then(write, write);
		await this.#writeQueue;
		if (!result) throw new Error("Local data write did not complete.");
		return result;
	}
}

export function localDataDirectory(): string {
	if (process.platform === "win32") {
		return join(
			process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local"),
			"RawSens",
		);
	}
	if (process.platform === "darwin") {
		return join(homedir(), "Library", "Application Support", "RawSens");
	}
	return join(
		process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share"),
		"rawsens",
	);
}

async function readDataFile(path: string): Promise<LocalData | null> {
	try {
		return parseLocalData(JSON.parse(await readFile(path, "utf8")));
	} catch {
		return null;
	}
}

async function writeAtomic(path: string, contents: string): Promise<void> {
	const temporaryPath = `${path}.tmp-${process.pid}-${crypto.randomUUID()}`;
	const file = await open(temporaryPath, "wx", 0o600);
	try {
		await file.writeFile(contents, "utf8");
		await file.sync();
	} finally {
		await file.close();
	}
	try {
		await rename(temporaryPath, path);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

async function copyAtomic(source: string, destination: string): Promise<void> {
	const temporaryPath = `${destination}.tmp-${process.pid}-${crypto.randomUUID()}`;
	try {
		await copyFile(source, temporaryPath);
		await rename(temporaryPath, destination);
	} catch (error) {
		await rm(temporaryPath, { force: true });
		throw error;
	}
}

async function fileExists(path: string): Promise<boolean> {
	try {
		const file = await open(path, "r");
		await file.close();
		return true;
	} catch {
		return false;
	}
}

function replaceById<Item extends { id: string }>(
	items: readonly Item[],
	next: Item,
): Item[] {
	const index = items.findIndex((item) => item.id === next.id);
	if (index < 0) return [...items, next];
	return items.map((item, itemIndex) => (itemIndex === index ? next : item));
}

function serialize(data: LocalData): string {
	return `${JSON.stringify(data, null, 2)}\n`;
}
