// The Shadow timeline/journal model — ported VERBATIM from the desktop client
// `apps/desktop/src/lib/api/shadow.ts` (the subset the Timeline page reads). Shadow
// is a device-local Rust sidecar (:3030); the host bridge reuses that very client
// (`getTimeline`/`getJournal`/`frameUrl`) and forwards its shapes unchanged over the
// `window.ryu.timeline` bridge, so the app reads exactly what the desktop page read.

/** A single timeline event from Shadow's `GET /timeline`. */
export interface TimelineEvent {
	/** Source/app label. */
	app_name: string | null;
	/** Event subtype (e.g. "clipboard_change", "app_switch", "git_activity"). */
	event_type: string;
	/** Capture lane: 1 visual, 2 input, 3 window, 4 audio, 5 AX, 6 clipboard,
	 * 7 filesystem, 8 git, 9 terminal, 10 notification, 11 calendar. */
	track: number;
	/** Event timestamp in Unix microseconds. */
	ts: number;
	/** Associated URL when present. */
	url: string | null;
	/** Primary text (window title, clipboard snippet, file path, …). */
	window_title: string | null;
}

/** Dayflow-inspired derived work-journal snapshot from Shadow. */
export interface JournalSnapshot {
	apps: JournalStat[];
	cards: JournalCard[];
	categories: JournalStat[];
	end_ts: number;
	focus: FocusStats;
	standup: JournalStandup;
	start_ts: number;
}

export interface JournalCard {
	category: string;
	/** Reconstruction-grade recap; upgraded by the LLM narration pass. */
	detailed_summary: string;
	distraction: boolean;
	/** Brief (<5 min) unrelated detours nested inside a focused card. */
	distractions: CardDistraction[];
	end_ts: number;
	event_count: number;
	id: string;
	primary_app: string;
	start_ts: number;
	summary: string;
	title: string;
}

export interface CardDistraction {
	end_ts: number;
	start_ts: number;
	summary: string;
	title: string;
}

export interface JournalStat {
	event_count: number;
	minutes: number;
	name: string;
}

export interface JournalStandup {
	blockers: string[];
	highlights: string[];
	tasks: string[];
}

/** Focus-vs-distraction analytics — the headline metric of the review surface. */
export interface FocusStats {
	communication_minutes: number;
	deep_work_minutes: number;
	distraction_minutes: number;
	focus_minutes: number;
	/** focus / (focus + distraction), 0..1. */
	focus_ratio: number;
	longest_focus_streak_minutes: number;
	total_minutes: number;
}
