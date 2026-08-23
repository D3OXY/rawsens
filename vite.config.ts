import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite.ts";

export default defineConfig({
	plugins: [tailwindcss(), react()],
	resolve: {
		alias: [
			...electrobunViteAliases(resolve(import.meta.dirname, ".hutch/devkit")),
			{ find: "#app", replacement: resolve(import.meta.dirname, "src") },
		],
	},
	root: "src/ui",
	build: {
		emptyOutDir: true,
		outDir: "../../dist",
	},
	server: {
		host: "127.0.0.1",
		port: 5173,
		strictPort: true,
	},
});
