import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

if (process.platform !== "darwin" && process.platform !== "win32") {
	throw new Error("The native input helper only targets macOS and Windows");
}

const outputDirectory = resolve("native/input-helper/bin");
const outputName =
	process.platform === "win32"
		? "rawsens-input-helper.exe"
		: "rawsens-input-helper";
await mkdir(outputDirectory, { recursive: true });

const compiler = spawn(
	"rustc",
	[
		"--edition=2024",
		"-C",
		"opt-level=2",
		"native/input-helper/src/main.rs",
		"-o",
		resolve(outputDirectory, outputName),
	],
	{ stdio: "inherit" },
);

const exitCode = await new Promise<number | null>((resolveExit, reject) => {
	compiler.once("error", reject);
	compiler.once("exit", resolveExit);
});
if (exitCode !== 0) {
	throw new Error(`rustc failed with exit code ${exitCode}`);
}
