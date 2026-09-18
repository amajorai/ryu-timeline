import { afterEach, describe, expect, it, setSystemTime } from "bun:test";
import {
	eventLabel,
	formatEventType,
	groupJournalCards,
	groupTimelineEvents,
} from "./timeline-view.ts";
import type { JournalCard, TimelineEvent } from "./types.ts";

const MICROS_PER_MILLISECOND = 1000;

function event(timestamp: string, title: string): TimelineEvent {
	return {
		app_name: "Browser",
		event_type: "app_switch",
		track: 3,
		ts: new Date(timestamp).getTime() * MICROS_PER_MILLISECOND,
		url: null,
		window_title: title,
	};
}

function card(start: string, title: string): JournalCard {
	const startTs = new Date(start).getTime() * MICROS_PER_MILLISECOND;
	return {
		category: "Deep Work",
		detailed_summary: `In Code: ${title}.`,
		distraction: false,
		distractions: [],
		end_ts: startTs + 60_000_000,
		event_count: 2,
		id: title,
		primary_app: "Code",
		apps: [],
		start_ts: startTs,
		summary: "Deep Work activity in Code from 2 captured signals.",
		title,
	};
}

afterEach(() => {
	setSystemTime();
});

describe("timeline view helpers", () => {
	it("groups events by local day, newest day and event first", () => {
		setSystemTime(new Date("2026-08-20T12:00:00"));
		const groups = groupTimelineEvents([
			event("2026-08-19T08:00:00", "Yesterday's work"),
			event("2026-08-20T09:00:00", "Morning work"),
			event("2026-08-20T11:00:00", "Latest work"),
		]);

		expect(groups.map((group) => group.label)).toEqual(["Today", "Yesterday"]);
		expect(groups[0].items.map((item) => item.window_title)).toEqual([
			"Latest work",
			"Morning work",
		]);
	});

	it("groups journal cards by their start timestamp", () => {
		setSystemTime(new Date("2026-08-20T12:00:00"));
		const groups = groupJournalCards([
			card("2026-08-20T09:00:00", "Morning focus"),
			card("2026-08-19T16:00:00", "Yesterday focus"),
		]);

		expect(groups[0].items[0].title).toBe("Morning focus");
		expect(groups[1].items[0].title).toBe("Yesterday focus");
	});

	it("formats event metadata without losing useful fallback text", () => {
		expect(formatEventType("clipboard_change")).toBe("Clipboard change");
		expect(formatEventType("")).toBe("Activity");
		expect(eventLabel(event("2026-08-20T09:00:00", "Window title"))).toBe(
			"Window title"
		);
	});
});
