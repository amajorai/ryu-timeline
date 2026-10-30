import { formatTime } from "@ryu/ui/lib/timezone.ts";
import type { TimelineEvent } from "./types.ts";

/** Capture-lane metadata: label, a badge tint, and a solid tick colour. */
export const TRACK_META = new Map(
	Object.entries({
		1: {
			label: "Screen",
			tint: "bg-slate-500/15 text-slate-600 dark:text-slate-300",
			bar: "bg-slate-400",
		},
		2: {
			label: "Input",
			tint: "bg-zinc-500/15 text-zinc-600 dark:text-zinc-300",
			bar: "bg-zinc-400",
		},
		3: {
			label: "Window",
			tint: "bg-info/15 text-status-info dark:text-status-info",
			bar: "bg-info",
		},
		4: {
			label: "Audio",
			tint: "bg-purple-500/15 text-purple-600 dark:text-purple-300",
			bar: "bg-purple-400",
		},
		5: {
			label: "Accessibility",
			tint: "bg-teal-500/15 text-teal-600 dark:text-teal-300",
			bar: "bg-teal-400",
		},
		6: {
			label: "Clipboard",
			tint: "bg-warning/15 text-status-warning dark:text-status-warning",
			bar: "bg-warning",
		},
		7: {
			label: "Filesystem",
			tint: "bg-success/15 text-status-success dark:text-status-success",
			bar: "bg-success",
		},
		8: {
			label: "Git",
			tint: "bg-orange-500/15 text-orange-600 dark:text-orange-300",
			bar: "bg-orange-400",
		},
		9: {
			label: "Terminal",
			tint: "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300",
			bar: "bg-neutral-400",
		},
		10: {
			label: "Notifications",
			tint: "bg-pink-500/15 text-pink-600 dark:text-pink-300",
			bar: "bg-pink-400",
		},
		11: {
			label: "Calendar",
			tint: "bg-destructive/15 text-status-destructive dark:text-status-destructive",
			bar: "bg-destructive",
		},
		12: {
			label: "Journal",
			tint: "bg-primary/15 text-primary dark:text-primary",
			bar: "bg-primary",
		},
	}).map(([track, metadata]) => [Number(track), metadata])
);

/** Range options for the header dropdown (`Select` wants string values). */
export const RANGE_ITEMS = [
	{ value: "15", label: "Last 15 min" },
	{ value: "60", label: "Last hour" },
	{ value: "360", label: "Last 6 hours" },
	{ value: "1440", label: "Last 24 hours" },
];

/** Playback speeds (real-seconds-per-second). 60x scrubs a minute every second. */
export const SPEEDS = [
	{ label: "1×", mult: 1 },
	{ label: "10×", mult: 10 },
	{ label: "60×", mult: 60 },
] as const;

export const LABEL_W = 104; // px, sticky lane-label gutter
/** Persisted toggle for CapCut-style hover-to-move-playhead (default on). */
export const HOVER_SEEK_KEY = "ryu.timeline.hoverSeek";
/** Default + bounds for the user-resizable preview/player pane height (px). */
export const PREVIEW_H_DEFAULT = 320;
export const PREVIEW_H_MIN = 140;
export const PREVIEW_H_MAX = 640;
export const MICROS_PER_MIN = 60 * 1_000_000;
export const PLAY_TICK_MS = 120;
export const MIN_ZOOM = 1;
export const MAX_ZOOM = 24;
/** Background poll cadence (ms). The desktop page had no interval; the sandbox
 *  shim polls silently so the view stays live without re-showing the spinner. */
export const POLL_MS = 15_000;
/** Narration makes an LLM call per fetch, so poll far less aggressively when it is
 *  on to avoid hammering the gateway (mirrors the desktop `useJournal`). */
export const JOURNAL_NARRATE_POLL_MS = 120_000;
/**
 * Pixel width of one event "bucket". Lanes render at most one tick per bucket,
 * so node count is bounded by visible pixels (≈ laneWidth / TICK_BUCKET_PX) no
 * matter how many events the range holds. Matches the visual 3px tick width, so
 * dense regions still read as a solid bar — they're just not 50k separate nodes.
 */
export const TICK_BUCKET_PX = 3;
/** Extra px rendered beyond the viewport edges so scrolling/zoom don't pop. */
export const VIRTUAL_PAD_PX = 240;
/** Stable empty array for lanes with no events (keeps `memo` referentially sane). */
export const EMPTY_EVENTS: TimelineEvent[] = [];

/** First index whose `ts >= tsMin` in an ascending-by-`ts` array. */
export function lowerBoundByTs(events: TimelineEvent[], tsMin: number): number {
	let lo = 0;
	let hi = events.length;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (events[mid].ts < tsMin) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
}

/** First index whose `ts > tsRef` in an ascending-by-`ts` array. */
export function upperBoundByTs(events: TimelineEvent[], tsRef: number): number {
	let lo = 0;
	let hi = events.length;
	while (lo < hi) {
		const mid = Math.floor((lo + hi) / 2);
		if (events[mid].ts <= tsRef) {
			lo = mid + 1;
		} else {
			hi = mid;
		}
	}
	return lo;
}

export function trackMeta(track: number) {
	return (
		TRACK_META.get(track) ?? {
			label: `Track ${track}`,
			tint: "bg-muted text-muted-foreground",
			bar: "bg-muted-foreground",
		}
	);
}

export function clamp(v: number, lo: number, hi: number): number {
	if (v < lo) {
		return lo;
	}
	if (v > hi) {
		return hi;
	}
	return v;
}

export function formatClock(tsMicros: number): string {
	return formatTime(tsMicros / 1000, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatTick(tsMicros: number, rangeMinutes: number): string {
	if (rangeMinutes >= 360) {
		return formatTime(tsMicros / 1000, {
			hour: "2-digit",
			minute: "2-digit",
		});
	}
	return formatTime(tsMicros / 1000, {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

export function formatMinutes(durationUs: number): string {
	const minutes = Math.max(1, Math.round(durationUs / MICROS_PER_MIN));
	return `${minutes}m`;
}
