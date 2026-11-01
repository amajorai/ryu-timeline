import { describe, expect, it } from "bun:test";
import { timelineEventsSchema, timelineJournalSchema } from "./schemas.ts";
import type { JournalSnapshot, TimelineEvent } from "./types.ts";

const event: TimelineEvent = {
	app_name: "Editor",
	event_type: "app_switch",
	track: 3,
	ts: 17,
	url: null,
	window_title: "Notes",
};
function journal(): JournalSnapshot {
	return {
		apps: [],
		cards: [
			{
				category: "coding",
				detailed_summary: "Edited notes",
				distraction: false,
				distractions: [],
				end_ts: 18,
				event_count: 1,
				id: "card-1",
				primary_app: "Editor",
				start_ts: 17,
				summary: "Edited notes",
				title: "Notes",
			},
		],
		categories: [],
		end_ts: 18,
		focus: {
			communication_minutes: 0,
			deep_work_minutes: 1,
			distraction_minutes: 0,
			focus_minutes: 1,
			focus_ratio: 1,
			longest_focus_streak_minutes: 1,
			total_minutes: 1,
		},
		standup: { blockers: [], highlights: [], tasks: [] },
		start_ts: 17,
	};
}
describe("Timeline shared readback contracts", () => {
	it("retains valid event arrays and record identities while rejecting malformed or unsanitized fields", () => {
		const events = [{ ...event, metadata: { source: "Shadow" } }];
		expect(timelineEventsSchema.parse(events)).toBe(events);
		expect(timelineEventsSchema.parse(null)).toBeNull();
		expect(
			timelineEventsSchema.safeParse([{ ...event, ts: "17" }]).success
		).toBe(false);
		expect(
			timelineEventsSchema.safeParse([
				{ ...event, app_path: "/private/device/app" },
			]).success
		).toBe(false);
	});
	it("retains full journals and legacy cards without apps, validating focus and sanitized app presentation", () => {
		const input = journal();
		expect(timelineJournalSchema.parse(input)).toBe(input);
		expect(timelineJournalSchema.parse(input)?.cards[0]).toBe(input.cards[0]);
		expect(timelineJournalSchema.parse(null)).toBeNull();
		expect(
			timelineJournalSchema.safeParse({
				...input,
				focus: { ...input.focus, focus_ratio: "1" },
			}).success
		).toBe(false);
		expect(
			timelineJournalSchema.safeParse({
				...input,
				cards: [
					{
						...input.cards[0],
						apps: [
							{
								name: "Editor",
								icon_url: null,
								bundle_id: "private.device.editor",
							},
						],
					},
				],
			}).success
		).toBe(false);
	});
});
