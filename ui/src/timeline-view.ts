import { formatDate, startOfTodayMs } from "@ryu/ui/lib/timezone.ts";
import type { JournalCard, TimelineEvent } from "./types.ts";

export interface TimelineDayGroup<T> {
	items: T[];
	key: string;
	label: string;
}

function displayDayKey(timestampMicros: number): string {
	return formatDate(timestampMicros / 1000, {
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
	});
}

function dayLabel(timestampMicros: number): string {
	const timestamp = timestampMicros / 1000;
	const today = startOfTodayMs();
	const day = startOfTodayMs(timestamp);
	const dayMs = 24 * 60 * 60 * 1000;
	if (day === today) {
		return "Today";
	}
	if (day === today - dayMs) {
		return "Yesterday";
	}
	return formatDate(timestamp, { month: "short", day: "numeric" });
}

function groupByDay<T>(
	items: readonly T[],
	getTimestamp: (item: T) => number
): TimelineDayGroup<T>[] {
	const ordered = [...items].sort((a, b) => getTimestamp(b) - getTimestamp(a));
	const groups: TimelineDayGroup<T>[] = [];
	for (const item of ordered) {
		const timestamp = getTimestamp(item);
		const key = displayDayKey(timestamp);
		const current = groups.at(-1);
		if (!current || current.key !== key) {
			groups.push({ items: [item], key, label: dayLabel(timestamp) });
			continue;
		}
		current.items.push(item);
	}
	return groups;
}

/** Group captured events newest-first so the feed reads like a history view. */
export function groupTimelineEvents(
	events: readonly TimelineEvent[]
): TimelineDayGroup<TimelineEvent>[] {
	return groupByDay(events, (event) => event.ts);
}

/** Group derived work-journal cards newest-first for the human-readable view. */
export function groupJournalCards(
	cards: readonly JournalCard[]
): TimelineDayGroup<JournalCard>[] {
	return groupByDay(cards, (card) => card.start_ts);
}

/** Turn wire event names such as `app_switch` into readable metadata labels. */
export function formatEventType(eventType: string): string {
	const words = eventType.replace(/[_-]+/g, " ").trim();
	if (!words) {
		return "Activity";
	}
	return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Pick the most useful human-readable label for a raw captured event. */
export function eventLabel(event: TimelineEvent): string {
	return event.window_title || event.url || formatEventType(event.event_type);
}
