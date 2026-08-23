import type { ElectrobunConfig } from "electrobun";
import packageJson from "./package.json" with { type: "json" };

export default {
	app: {
		name: "RawSens",
		identifier: "dev.d3oxy.rawsens",
		version: packageJson.version,
	},
	runtime: {
		exitOnLastWindowClosed: true,
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/main/index.ts",
		},
		copy: {
			"dist/assets": "views/main/assets",
			"dist/index.html": "views/main/index.html",
		},
		watchIgnore: ["dist/**"],
		win: {
			bundleCEF: false,
		},
	},
	release: {
		baseUrl: "https://github.com/D3OXY/rawsens/releases/latest/download",
	},
} satisfies ElectrobunConfig;
