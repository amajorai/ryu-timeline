import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const EVIDENCE_DIRECTORY =
	process.env.RYU_TIMELINE_EVIDENCE_DIR ??
	path.join(import.meta.dirname, "../evidence");

let browserErrors = [];

test.beforeEach(async ({ page }) => {
	browserErrors = [];
	page.on("pageerror", (error) => browserErrors.push(error.message));
});

test.afterEach(() => {
	expect(browserErrors).toEqual([]);
});

function createFixture(overrides = {}) {
	const now = Math.floor(Date.now() / 1000) * 1_000_000;
	const events = [
		{
			app_name: "Visual Studio Code",
			event_type: "screen_activity",
			track: 1,
			ts: now - 240_000_000,
			url: null,
			window_title: "Review product brief",
		},
		{
			app_name: "Terminal",
			event_type: "git_activity",
			track: 8,
			ts: now - 125_000_000,
			url: null,
			window_title: "Committed review notes",
		},
		{
			app_name: "Notes",
			event_type: "clipboard_change",
			track: 6,
			ts: now - 35_000_000,
			url: null,
			window_title: "Draft ready to share",
		},
	];
	const journal = makeJournal(
		now,
		"Deep-work sprint",
		"Reviewed the product brief and recorded decisions."
	);
	const narratedJournal = makeJournal(
		now,
		"Polished focus block",
		"Reviewed the brief, confirmed decisions, and captured next steps."
	);
	return {
		context: null,
		frameDataUrl: null,
		frameFails: false,
		holdList: false,
		journalFails: false,
		journalResult: journal,
		listFails: false,
		narratedJournal,
		timelineResult: events,
		...overrides,
	};
}

function makeJournal(now, title, summary) {
	const startTs = now - 205_000_000;
	const endTs = now - 90_000_000;
	return {
		apps: [{ event_count: 9, minutes: 3, name: "Visual Studio Code" }],
		cards: [
			{
				apps: [
					{ icon_url: null, name: "Visual Studio Code" },
					{ icon_url: null, name: "Browser" },
				],
				category: "Deep Work",
				detailed_summary: `In Code: ${summary}`,
				distraction: false,
				distractions: [],
				end_ts: endTs,
				event_count: 9,
				id: title.toLowerCase().replaceAll(" ", "-"),
				primary_app: "Visual Studio Code",
				start_ts: startTs,
				summary,
				title,
			},
		],
		categories: [{ event_count: 9, minutes: 3, name: "Deep Work" }],
		end_ts: now,
		focus: {
			communication_minutes: 1,
			deep_work_minutes: 3,
			distraction_minutes: 0,
			focus_minutes: 3,
			focus_ratio: 1,
			longest_focus_streak_minutes: 3,
			total_minutes: 4,
		},
		standup: {
			blockers: ["Waiting for design review"],
			highlights: ["Finished the brief review"],
			tasks: ["Share the next-step list"],
		},
		start_ts: startTs,
	};
}

function installRyuBridge(setup) {
	const pendingLists = [];
	const harness = {
		...setup,
		calls: { frame: [], journal: [], list: [], openTab: [] },
		releaseList() {
			this.holdList = false;
			for (const resolve of pendingLists.splice(0)) {
				resolve(this.timelineResult);
			}
		},
	};
	const frameCanvas = document.createElement("canvas");
	frameCanvas.width = 640;
	frameCanvas.height = 360;
	const frameContext = frameCanvas.getContext("2d");
	if (frameContext) {
		frameContext.fillStyle = "#15233b";
		frameContext.fillRect(0, 0, 640, 360);
		frameContext.fillStyle = "#93c5fd";
		frameContext.fillRect(40, 60, 560, 3);
		frameContext.fillStyle = "#ffffff";
		frameContext.font = "28px sans-serif";
		frameContext.fillText("Timeline fixture frame", 40, 190);
		harness.frameDataUrl = frameCanvas.toDataURL("image/png");
	}
	window.__timelineHarness = harness;
	window.ryu = {
		context: setup.context,
		shell: {
			openTab: async (args) => {
				harness.calls.openTab.push(args);
			},
			subscribeTheme: ({ onChange }) => {
				onChange({});
				return { dispose() {} };
			},
		},
		timeline: {
			list: async (args) => {
				harness.calls.list.push(args);
				if (harness.listFails) {
					throw new Error("Shadow fixture is unavailable");
				}
				if (harness.holdList) {
					return new Promise((resolve) => pendingLists.push(resolve));
				}
				return harness.timelineResult;
			},
			journal: async (args) => {
				harness.calls.journal.push(args);
				if (harness.journalFails) {
					throw new Error("Journal fixture is unavailable");
				}
				return args.narrate ? harness.narratedJournal : harness.journalResult;
			},
			frame: async (args) => {
				harness.calls.frame.push(args);
				if (harness.frameFails) {
					throw new Error("Frame fixture is unavailable");
				}
				return harness.frameDataUrl;
			},
		},
	};
}

async function openTimeline(page, overrides = {}) {
	const setup = createFixture(overrides);
	await page.addInitScript(installRyuBridge, setup);
	await page.goto("/");
	return setup;
}

async function harness(page) {
	return page.evaluate(() => window.__timelineHarness);
}

async function playheadText(page) {
	return page.getByRole("timer", { name: "Playback time" }).innerText();
}

test("loads real replay data, journal, and keyframe fixture", async ({
	page,
}) => {
	await openTimeline(page, { holdList: true });
	await expect(page.getByRole("status", { name: "Loading" })).toBeVisible();
	await page.evaluate(() => window.__timelineHarness.releaseList());
	await expect(page.getByRole("group", { name: "Screen lane" })).toBeVisible();
	await expect(page.getByText("Work journal", { exact: true })).toBeVisible();
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	await expect(
		page.getByRole("img", { name: "Screen at playhead" })
	).toBeVisible();
	const calls = await harness(page);
	expect(calls.calls.list.at(-1)).toEqual({ rangeMinutes: 60 });
	expect(calls.calls.journal.at(-1)).toEqual({
		rangeMinutes: 60,
		narrate: false,
	});
	await mkdir(EVIDENCE_DIRECTORY, { recursive: true });
	await page.screenshot({
		animations: "disabled",
		fullPage: true,
		path: path.join(EVIDENCE_DIRECTORY, "timeline-replay-rendered.png"),
	});
});

test("changing the range reloads the matching timeline and journal", async ({
	page,
}) => {
	await openTimeline(page);
	await expect(page.getByRole("group", { name: "Screen lane" })).toBeVisible();
	const range = page.getByRole("combobox");
	await range.click();
	await page.getByRole("option", { name: "Last 15 min" }).click();
	await expect(range).toContainText("Last 15 min");
	await expect
		.poll(async () => (await harness(page)).calls.list.at(-1)?.rangeMinutes)
		.toBe(15);
	await expect
		.poll(async () => (await harness(page)).calls.journal.at(-1))
		.toEqual({ rangeMinutes: 15, narrate: false });
});

test("journal history opens a selected focus block in replay", async ({
	page,
}) => {
	await openTimeline(page);
	await page.getByRole("button", { name: "Timeline view" }).click();
	await expect(page.getByTestId("timeline-history-view")).toBeVisible();
	await expect(page.getByRole("heading", { name: "History" })).toBeVisible();
	const block = page.getByRole("button", {
		name: "Open Deep-work sprint in replay",
	});
	await expect(block).toBeVisible();
	await block.click();
	await expect(
		page.getByRole("button", { name: "Scrub timeline" })
	).toBeVisible();
	await expect(
		page.getByRole("timer", { name: "Playback time" })
	).not.toHaveText("");
});

test("raw history fallback opens the selected captured event", async ({
	page,
}) => {
	await openTimeline(page, { journalResult: null });
	await page.getByRole("button", { name: "Timeline view" }).click();
	await expect(page.getByTestId("timeline-history-view")).toContainText(
		"Your recent captured activity, newest first."
	);
	const event = page.getByRole("button", {
		name: "Open Review product brief in replay",
	});
	await expect(event).toBeVisible();
	await event.click();
	await expect(
		page.getByRole("button", { name: "Scrub timeline" })
	).toBeVisible();
});

test("replay transport changes time, zoom, speed, and saved hover mode", async ({
	page,
}) => {
	await openTimeline(page);
	await expect(
		page.getByRole("button", { name: "Step backward" })
	).toBeEnabled();
	const initialTime = await playheadText(page);
	await page.getByRole("button", { name: "Step backward" }).click();
	await expect(
		page.getByRole("timer", { name: "Playback time" })
	).not.toHaveText(initialTime);

	const play = page.getByRole("button", { name: "Play", exact: true });
	const beforePlay = await playheadText(page);
	await play.click();
	await expect(
		page.getByRole("button", { name: "Pause", exact: true })
	).toBeVisible();
	await expect.poll(() => playheadText(page)).not.toBe(beforePlay);
	await page.getByRole("button", { name: "Pause", exact: true }).click();
	const pausedTime = await playheadText(page);
	await page.getByRole("button", { name: "Step forward" }).click();
	await expect(
		page.getByRole("timer", { name: "Playback time" })
	).not.toHaveText(pausedTime);
	await page.getByRole("button", { name: "Step backward" }).click();
	const steppedTime = await playheadText(page);
	await page.getByRole("button", { name: "Now", exact: true }).click();
	await expect(
		page.getByRole("timer", { name: "Playback time" })
	).not.toHaveText(steppedTime);

	const lane = page.getByRole("group", { name: "Screen lane" });
	const baseWidth = (await lane.boundingBox()).width;
	await page.getByRole("button", { name: "Zoom in" }).click();
	await expect
		.poll(async () => (await lane.boundingBox()).width)
		.toBeGreaterThan(baseWidth);
	const zoomedWidth = (await lane.boundingBox()).width;
	await page.getByRole("button", { name: "Zoom out" }).click();
	await expect
		.poll(async () => (await lane.boundingBox()).width)
		.toBeLessThan(zoomedWidth);

	const speed = page.getByRole("button", { name: /Playback speed/ });
	await speed.click();
	await expect(
		page.getByRole("button", { name: /Playback speed 1×/ })
	).toBeVisible();
	await page.getByRole("button", { name: /Playback speed 1×/ }).click();
	await expect(
		page.getByRole("button", { name: /Playback speed 10×/ })
	).toBeVisible();
	await page.getByRole("button", { name: /Playback speed 10×/ }).click();
	await expect(
		page.getByRole("button", { name: /Playback speed 60×/ })
	).toBeVisible();

	const hover = page.getByRole("button", { name: "Hover", exact: true });
	await expect(hover).toHaveAttribute("aria-pressed", "true");
	await hover.click();
	await expect(hover).toHaveAttribute("aria-pressed", "false");
	expect(
		await page.evaluate(() => localStorage.getItem("ryu.timeline.hoverSeek"))
	).toBe("0");
	await page.reload();
	await expect(
		page.getByRole("button", { name: "Hover", exact: true })
	).toHaveAttribute("aria-pressed", "false");
});

test("ruler, lanes, and event marks seek the playhead", async ({ page }) => {
	await openTimeline(page);
	const hover = page.getByRole("button", { name: "Hover", exact: true });
	const clock = page.getByRole("timer", { name: "Playback time" });
	const initialTime = await clock.innerText();
	const lane = await page
		.getByRole("group", { name: "Screen lane" })
		.boundingBox();
	await page.mouse.move(lane.x + 190, lane.y + 16);
	await expect(clock).not.toHaveText(initialTime);
	await hover.click();
	const hoverOffTime = await clock.innerText();
	await page.mouse.move(lane.x + 310, lane.y + 16);
	await expect(clock).toHaveText(hoverOffTime);

	await page.getByRole("button", { name: "Scrub timeline" }).click({
		position: { x: 190, y: 12 },
	});
	await expect(clock).not.toHaveText(initialTime);

	const beforeLaneScrub = await clock.innerText();
	await page.getByRole("group", { name: "Screen lane" }).click({
		position: { x: 310, y: 16 },
	});
	await expect(clock).not.toHaveText(beforeLaneScrub);

	const tick = page.getByRole("button", {
		name: /Screen event Review product brief at/,
	});
	await expect(tick).toHaveAttribute("title", /Review product brief/);
	await tick.focus();
	await expect(tick).toBeFocused();
	const beforeEventSeek = await clock.innerText();
	await page.keyboard.press("Enter");
	await expect(clock).not.toHaveText(beforeEventSeek);
	const keyboardSeekTime = await clock.innerText();
	const pointerTick = page.getByRole("button", {
		name: /Git event Committed review notes at/,
	});
	await pointerTick.click();
	await expect(clock).not.toHaveText(keyboardSeekTime);
});

test("resizing the player changes its rendered preview height", async ({
	page,
}) => {
	await openTimeline(page);
	const preview = page.locator("[data-timeline-preview-pane]");
	const before = (await preview.boundingBox()).height;
	expect(before).toBeGreaterThan(0);
	const divider = await page
		.getByRole("button", { name: "Resize player" })
		.boundingBox();
	await page.mouse.move(
		divider.x + divider.width / 2,
		divider.y + divider.height / 2
	);
	await page.mouse.down();
	await page.mouse.move(
		divider.x + divider.width / 2,
		divider.y + divider.height / 2 + 70
	);
	await page.mouse.up();
	await expect
		.poll(async () => (await preview.boundingBox()).height)
		.toBeGreaterThan(before + 40);
});

test("timeline errors recover through Try again", async ({ page }) => {
	await openTimeline(page, { listFails: true });
	await expect(
		page.getByText("Couldn't load your timeline", { exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		window.__timelineHarness.listFails = false;
	});
	await page.getByRole("button", { name: "Try again" }).click();
	await expect(page.getByRole("group", { name: "Screen lane" })).toBeVisible();
	const calls = await harness(page);
	expect(calls.calls.list.length).toBeGreaterThan(1);
});

test("recording-off state routes the user to Settings", async ({ page }) => {
	await openTimeline(page, { timelineResult: null });
	await expect(
		page.getByText("Activity recording is off", { exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Open settings" }).click();
	await expect
		.poll(async () => (await harness(page)).calls.openTab)
		.toContainEqual({ path: "/settings" });
});

test("AI polish refreshes journal copy and Weekly review opens", async ({
	page,
}) => {
	await openTimeline(page);
	await page.getByRole("button", { name: "Polish with AI" }).click();
	await expect(page.getByRole("button", { name: "AI on" })).toBeVisible();
	await expect(
		page.getByText("Polished focus block", { exact: true })
	).toBeVisible();
	await expect
		.poll(async () => (await harness(page)).calls.journal.at(-1))
		.toEqual({ rangeMinutes: 60, narrate: true });
	await page.getByRole("button", { name: "AI on" }).click();
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	await page.getByRole("button", { name: "Weekly review" }).click();
	await expect
		.poll(async () => (await harness(page)).calls.openTab)
		.toContainEqual({ path: "/review", title: "Weekly review" });
});

test("failed journal refresh retries exactly once", async ({ page }) => {
	await openTimeline(page, { journalFails: true });
	await expect(
		page.getByText("Couldn’t refresh the work journal", { exact: false })
	).toBeVisible();
	await page.evaluate(() => {
		window.__timelineHarness.journalFails = false;
	});
	const beforeRetry = (await harness(page)).calls.journal.length;
	await page.getByRole("button", { name: "Retry journal" }).click();
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	await expect(
		page.getByText("Couldn’t refresh the work journal", { exact: false })
	).toBeHidden();
	const calls = await harness(page);
	expect(calls.calls.journal.length).toBe(beforeRetry + 1);
	expect(calls.calls.journal.at(-1)).toEqual({
		rangeMinutes: 60,
		narrate: false,
	});
});

test("a failed refresh keeps existing journal cards and retries inline", async ({
	page,
}) => {
	await openTimeline(page);
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		window.__timelineHarness.journalFails = true;
	});
	const range = page.getByRole("combobox");
	await range.click();
	await page.getByRole("option", { name: "Last 15 min" }).click();
	const refreshAlert = page
		.getByRole("alert")
		.filter({ hasText: "Couldn’t refresh the work journal" });
	await expect(refreshAlert).toBeVisible();
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	await page.evaluate(() => {
		window.__timelineHarness.journalFails = false;
	});
	const beforeRetry = (await harness(page)).calls.journal.length;
	await refreshAlert.getByRole("button", { name: "Retry journal" }).click();
	await expect(refreshAlert).toBeHidden();
	await expect(
		page.getByText("Deep-work sprint", { exact: true })
	).toBeVisible();
	const calls = await harness(page);
	expect(calls.calls.journal.length).toBe(beforeRetry + 1);
	expect(calls.calls.journal.at(-1)).toEqual({
		rangeMinutes: 15,
		narrate: false,
	});
});

test("a replay journal card seeks to its start time", async ({ page }) => {
	await openTimeline(page);
	const clock = page.getByRole("timer", { name: "Playback time" });
	const before = await clock.innerText();
	await page.getByRole("button", { name: /Deep-work sprint/ }).click();
	await expect(clock).not.toHaveText(before);
});

test("visible help tooltips explain hover, playback speed, and zoom", async ({
	page,
}) => {
	await openTimeline(page);
	const tooltip = (text) =>
		page
			.locator('[data-slot="tooltip-content"][data-open]')
			.filter({ hasText: text });
	await page.getByRole("button", { name: "Hover", exact: true }).focus();
	await expect(tooltip("Hover preview on:")).toBeVisible();
	await page.getByRole("button", { name: /Playback speed/ }).focus();
	await expect(tooltip("Playback speed — click to cycle")).toBeVisible();
	await page.getByRole("button", { name: "Zoom out" }).focus();
	await expect(tooltip("Zoom out")).toBeVisible();
	await page.getByRole("button", { name: "Zoom in" }).focus();
	await expect(tooltip("Zoom in")).toBeVisible();
});

test("background polling refreshes timeline data", async ({ page }) => {
	await page.clock.install({ time: new Date() });
	await openTimeline(page);
	await expect(page.getByRole("group", { name: "Screen lane" })).toBeVisible();
	const before = (await harness(page)).calls.list.length;
	await page.clock.fastForward(15_001);
	await expect
		.poll(async () => (await harness(page)).calls.list.length)
		.toBeGreaterThan(before);
});
