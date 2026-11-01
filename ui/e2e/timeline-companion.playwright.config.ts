import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const e2eDirectory = import.meta.dirname;
const appRoot = path.resolve(e2eDirectory, "..");
const baseURL = "http://127.0.0.1:4397";

export default defineConfig({
	testDir: e2eDirectory,
	testMatch: "timeline-companion.spec.ts",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	outputDir:
		process.env.RYU_TIMELINE_TEST_OUTPUT_DIR ??
		"/tmp/ryu-timeline-playwright-results",
	use: {
		...devices["Desktop Chrome"],
		baseURL,
		viewport: { width: 1440, height: 1000 },
		trace: "retain-on-failure",
	},
	webServer: {
		command:
			"bun run build && bun run vite preview --host 127.0.0.1 --port 4397 --strictPort",
		cwd: appRoot,
		url: baseURL,
		reuseExistingServer: false,
		timeout: 120_000,
	},
});
