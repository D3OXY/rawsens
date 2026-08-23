import { readdir, readFile } from "node:fs/promises";
import { basename, resolve } from "node:path";

type Platform = "macos" | "win";

type UpdateManifest = {
	schemaVersion: number;
	identifier: string;
	channel: string;
	version: string;
	hash: string;
	platform: Platform;
	arch: string;
	artifact: { file: string };
};

const args = new Map<string, string>();
const cliArgs = process.argv.slice(2);
for (let index = 0; index < cliArgs.length; index += 2) {
	const flag = cliArgs[index];
	const value = cliArgs[index + 1];
	if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
		throw new Error(`Invalid argument pair at ${flag ?? "end of command"}`);
	}
	args.set(flag.slice(2), value);
}
const target = args.get("platform");
const directory = resolve(args.get("dir") ?? "artifacts");
if (target !== "all" && target !== "macos" && target !== "win") {
	throw new Error("--platform must be all, macos, or win");
}

const packageJson = JSON.parse(await readFile("package.json", "utf8")) as {
	version: string;
};
const config = await readFile("electrobun.config.ts", "utf8");
if (
	!config.includes(
		'baseUrl: "https://github.com/D3OXY/rawsens/releases/latest/download"',
	)
) {
	throw new Error(
		"Electrobun release.baseUrl must use this repository's latest GitHub release",
	);
}

const files = (await readdir(directory, { withFileTypes: true }))
	.filter((entry) => entry.isFile())
	.map((entry) => entry.name)
	.sort();
const manifestFiles = files.filter((file) =>
	/^stable-(macos|win)-[^/]+-update\.json$/.test(file),
);
const platforms =
	target === "all" ? (["macos", "win"] as const) : ([target] as const);

if (manifestFiles.length !== platforms.length) {
	throw new Error(
		`Expected ${platforms.length} update manifest(s), found ${manifestFiles.length}: ${manifestFiles.join(", ")}`,
	);
}

const allowed = new Set<string>();
for (const platform of platforms) {
	const file = manifestFiles.find((name) =>
		name.startsWith(`stable-${platform}-`),
	);
	if (!file) throw new Error(`Missing ${platform} update manifest`);
	const manifest = JSON.parse(
		await readFile(resolve(directory, file), "utf8"),
	) as UpdateManifest;
	assertManifest(manifest, platform, packageJson.version, file);

	const prefix = `stable-${manifest.platform}-${manifest.arch}`;
	const installer =
		platform === "macos"
			? `${platform}-${manifest.arch}-RawSens.dmg`
			: `${platform}-${manifest.arch}-RawSens-Setup.exe`;
	allowed.add(file);
	allowed.add(installer);
	allowed.add(manifest.artifact.file);

	for (const name of [file, installer, manifest.artifact.file]) {
		if (!files.includes(name))
			throw new Error(`Missing required artifact: ${name}`);
	}
	for (const patch of files.filter(
		(name) => name.startsWith(`${prefix}-`) && name.endsWith(".patch"),
	)) {
		allowed.add(patch);
	}
}

const extras = files.filter((file) => !allowed.has(file));
if (extras.length > 0)
	throw new Error(`Unexpected release artifact(s): ${extras.join(", ")}`);
console.log(
	`Verified ${files.length} release artifacts in ${basename(directory)}: ${files.join(", ")}`,
);

function assertManifest(
	manifest: UpdateManifest,
	platform: Platform,
	version: string,
	file: string,
): void {
	if (manifest.schemaVersion !== 1)
		throw new Error(`${file}: unsupported schemaVersion`);
	if (manifest.identifier !== "dev.d3oxy.rawsens")
		throw new Error(`${file}: wrong app identifier`);
	if (manifest.channel !== "stable")
		throw new Error(`${file}: channel must be stable`);
	if (manifest.version !== version)
		throw new Error(`${file}: version does not match package.json`);
	if (manifest.platform !== platform)
		throw new Error(`${file}: platform mismatch`);
	if (!manifest.arch || !manifest.hash)
		throw new Error(`${file}: missing arch or hash`);
	const prefix = `stable-${manifest.platform}-${manifest.arch}`;
	const expectedTar = `${prefix}-${platform === "macos" ? "RawSens.app.tar.zst" : "RawSens.tar.zst"}`;
	if (manifest.artifact.file !== expectedTar)
		throw new Error(`${file}: wrong updater archive name`);
}
