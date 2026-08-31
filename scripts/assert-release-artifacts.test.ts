import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import packageJson from "../package.json";

const temporaryDirectories: string[] = [];

afterEach(async () => {
	await Promise.all(
		temporaryDirectories
			.splice(0)
			.map((directory) => rm(directory, { recursive: true, force: true })),
	);
});

describe("release artifact assertion", () => {
	test("accepts one complete updater set for Windows and macOS", async () => {
		const directory = await fixtureDirectory();
		const result = await runAssertion(directory);
		expect(result.exitCode).toBe(0);
		expect(result.output).toContain("Verified 6 release artifacts");
	});

	test("rejects missing or unexpected release files before publishing", async () => {
		const directory = await fixtureDirectory();
		await rm(join(directory, "win-x64-RawSens-Setup.zip"));
		await writeFile(join(directory, "duplicate-release.zip"), "duplicate");
		const result = await runAssertion(directory);
		expect(result.exitCode).not.toBe(0);
		expect(result.output).toContain("Missing required artifact");
	});
});

async function fixtureDirectory(): Promise<string> {
	const directory = await mkdtemp(join(tmpdir(), "rawsens-release-"));
	temporaryDirectories.push(directory);
	await Promise.all([
		writeManifest(directory, "macos", "arm64", "RawSens.app.tar.zst"),
		writeManifest(directory, "win", "x64", "RawSens.tar.zst"),
		writeFile(join(directory, "macos-arm64-RawSens.dmg"), "dmg"),
		writeFile(join(directory, "win-x64-RawSens-Setup.zip"), "zip"),
		writeFile(
			join(directory, "stable-macos-arm64-RawSens.app.tar.zst"),
			"mac update",
		),
		writeFile(join(directory, "stable-win-x64-RawSens.tar.zst"), "win update"),
	]);
	return directory;
}

async function writeManifest(
	directory: string,
	platform: "macos" | "win",
	arch: string,
	archive: string,
): Promise<void> {
	const prefix = `stable-${platform}-${arch}`;
	await writeFile(
		join(directory, `${prefix}-update.json`),
		JSON.stringify({
			schemaVersion: 1,
			identifier: "dev.d3oxy.rawsens",
			channel: "stable",
			version: packageJson.version,
			hash: "fixture-hash",
			platform,
			arch,
			artifact: { file: `${prefix}-${archive}` },
		}),
	);
}

async function runAssertion(
	directory: string,
): Promise<{ exitCode: number; output: string }> {
	const child = Bun.spawn(
		[
			process.execPath,
			"scripts/assert-release-artifacts.ts",
			"--platform",
			"all",
			"--dir",
			directory,
		],
		{ cwd: `${import.meta.dir}/..`, stdout: "pipe", stderr: "pipe" },
	);
	const [exitCode, stdout, stderr] = await Promise.all([
		child.exited,
		new Response(child.stdout).text(),
		new Response(child.stderr).text(),
	]);
	return { exitCode, output: stdout + stderr };
}
