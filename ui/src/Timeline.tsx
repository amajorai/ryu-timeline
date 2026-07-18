// The Timeline companion (Path B, ui_format:"html"). PORTED from the desktop
// `apps/desktop/src/pages/TimelinePage.tsx`: same @ryu/ui components, same layout,
// same helper component tree (PreviewPane, FrameThumb, JournalPane, TransportBar,
// Ruler, TrackLane), same classNames, same binning/virtualization, same empty/
// loading/error states. ONLY the data layer and three shell couplings changed:
//
//   1. `useTimeline`/`useJournal` (`@tanstack/react-query` on a direct `fetch` to
//      Shadow :3030) → the `window.ryu.timeline` bridge + the local 15s-poll
//      `useQuery` shim. Shadow is device-local, so the host calls it host-side
//      WITHOUT a node token (the `shadow.ts` INVARIANT).
//   2. The range picker lived in the SHELL TITLEBAR via `useTitleBar` (which cannot
//      cross the sandbox); it moves into a compact in-body header — matching every
//      sibling companion, all of which render their controls in-body. This is the
//      one documented visual deviation from the desktop page.
//   3. The keyframe `<img src={frameUrl(...)}>` (a direct Shadow URL, blocked by the
//      frame CSP `img-src data: blob:`) → an async host-fetched `data:` URL; and the
//      `ryu:timeline-focus` window event (cannot cross the sandbox) → a one-shot
//      `window.ryu.context.focusTs` a deep-link bakes into the mount context.

import {
	Activity01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Clock01Icon,
	Files01Icon,
	Image01Icon,
	PlayIcon,
	RotateClockwiseIcon,
	SparklesIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Empty,
	EmptyContent,
	EmptyDescription,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@ryu/ui/components/empty.tsx";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ryu/ui/components/select.tsx";
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ryu/ui/components/tooltip.tsx";
import {
	memo,
	type PointerEvent as ReactPointerEvent,
	type RefObject,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	focusContextTs,
	getFrameDataUrl,
	getJournal,
	getTimeline,
	openReview,
	openSettings,
} from "./bridge.ts";
import { FocusSummary } from "./FocusSummary.tsx";
import { useQuery } from "./query.ts";
import type {
	JournalCard,
	JournalSnapshot,
	TimelineEvent,
} from "./types.ts";

/** Capture-lane metadata: label, a badge tint, and a solid tick colour. */
const TRACK_META: Record<number, { label: string; tint: string; bar: string }> =
	{
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
			tint: "bg-info/15 text-info dark:text-info",
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
			tint: "bg-warning/15 text-warning dark:text-warning",
			bar: "bg-warning",
		},
		7: {
			label: "Filesystem",
			tint: "bg-success/15 text-success dark:text-success",
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
			tint: "bg-destructive/15 text-destructive dark:text-destructive",
			bar: "bg-destructive",
		},
		12: {
			label: "Journal",
			tint: "bg-primary/15 text-primary dark:text-primary",
			bar: "bg-primary",
		},
	};

/** Range options for the header dropdown (`Select` wants string values). */
const RANGE_ITEMS = [
	{ value: "15", label: "Last 15 min" },
	{ value: "60", label: "Last hour" },
	{ value: "360", label: "Last 6 hours" },
	{ value: "1440", label: "Last 24 hours" },
];

/** Playback speeds (real-seconds-per-second). 60x scrubs a minute every second. */
const SPEEDS = [
	{ label: "1×", mult: 1 },
	{ label: "10×", mult: 10 },
	{ label: "60×", mult: 60 },
] as const;

const LABEL_W = 104; // px, sticky lane-label gutter
/** Persisted toggle for CapCut-style hover-to-move-playhead (default on). */
const HOVER_SEEK_KEY = "ryu.timeline.hoverSeek";
/** Default + bounds for the user-resizable preview/player pane height (px). */
const PREVIEW_H_DEFAULT = 320;
const PREVIEW_H_MIN = 140;
const PREVIEW_H_MAX = 640;
const MICROS_PER_MIN = 60 * 1_000_000;
const PLAY_TICK_MS = 120;
const MIN_ZOOM = 1;
const MAX_ZOOM = 24;
/** Background poll cadence (ms). The desktop page had no interval; the sandbox
 *  shim polls silently so the view stays live without re-showing the spinner. */
const POLL_MS = 15_000;
/** Narration makes an LLM call per fetch, so poll far less aggressively when it is
 *  on to avoid hammering the gateway (mirrors the desktop `useJournal`). */
const JOURNAL_NARRATE_POLL_MS = 120_000;
/**
 * Pixel width of one event "bucket". Lanes render at most one tick per bucket,
 * so node count is bounded by visible pixels (≈ laneWidth / TICK_BUCKET_PX) no
 * matter how many events the range holds. Matches the visual 3px tick width, so
 * dense regions still read as a solid bar — they're just not 50k separate nodes.
 */
const TICK_BUCKET_PX = 3;
/** Extra px rendered beyond the viewport edges so scrolling/zoom don't pop. */
const VIRTUAL_PAD_PX = 240;
/** Stable empty array for lanes with no events (keeps `memo` referentially sane). */
const EMPTY_EVENTS: TimelineEvent[] = [];

/** First index whose `ts >= tsMin` in an ascending-by-`ts` array. */
function lowerBoundByTs(events: TimelineEvent[], tsMin: number): number {
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
function upperBoundByTs(events: TimelineEvent[], tsRef: number): number {
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

/** Debounce a fast-changing value so downstream effects (e.g. image loads) coalesce. */
function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}

/**
 * Resolve the keyframe at `tsMicros` to a `data:` URL via the host bridge (the
 * frame cannot fetch Shadow's `/frame` itself under `img-src data: blob:`). Resets
 * to `null` while a new bucket loads and on failure, so the caller renders its
 * placeholder — parity with the desktop `<img onError>` fallback.
 */
function useFrameDataUrl(tsMicros: number): string | null {
	const [src, setSrc] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		setSrc(null);
		getFrameDataUrl(tsMicros)
			.then((url) => {
				if (alive) {
					setSrc(url);
				}
			})
			.catch(() => {
				if (alive) {
					setSrc(null);
				}
			});
		return () => {
			alive = false;
		};
	}, [tsMicros]);
	return src;
}

function trackMeta(track: number) {
	return (
		TRACK_META[track] ?? {
			label: `Track ${track}`,
			tint: "bg-muted text-muted-foreground",
			bar: "bg-muted-foreground",
		}
	);
}

function clamp(v: number, lo: number, hi: number): number {
	if (v < lo) {
		return lo;
	}
	if (v > hi) {
		return hi;
	}
	return v;
}

function formatClock(tsMicros: number): string {
	return new Date(tsMicros / 1000).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function formatTick(tsMicros: number, rangeMinutes: number): string {
	const d = new Date(tsMicros / 1000);
	if (rangeMinutes >= 360) {
		return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
	}
	return d.toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
	});
}

function eventLabel(e: TimelineEvent): string {
	return e.window_title || e.url || e.event_type;
}

/** Measure an element's content width with a ResizeObserver. */
function useElementWidth(ref: RefObject<HTMLElement | null>): number {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		setWidth(el.clientWidth);
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [ref]);
	return width;
}

export function Timeline() {
	const [rangeMinutes, setRangeMinutes] = useState<number>(60);
	const [zoom, setZoom] = useState(1);
	const [playing, setPlaying] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(2);
	const [playheadTs, setPlayheadTs] = useState<number>(() => Date.now() * 1000);
	const [nowMicros, setNowMicros] = useState<number>(() => Date.now() * 1000);
	// User-resizable height of the preview/player pane (drag the divider below it).
	const [previewHeight, setPreviewHeight] = useState(PREVIEW_H_DEFAULT);
	// CapCut-style "preview axis": when on, hovering the timeline moves the
	// playhead line to the cursor; when off, the line only moves on click/scrub.
	const [hoverSeek, setHoverSeek] = useState<boolean>(() => {
		const v = localStorage.getItem(HOVER_SEEK_KEY);
		return v === null ? true : v === "1";
	});
	useEffect(() => {
		localStorage.setItem(HOVER_SEEK_KEY, hoverSeek ? "1" : "0");
	}, [hoverSeek]);

	const { data, isLoading, isError, refetch } = useQuery({
		queryKey: ["shadow-timeline", rangeMinutes],
		queryFn: () => getTimeline(rangeMinutes),
		refetchInterval: POLL_MS,
	});
	const [narrateJournal, setNarrateJournal] = useState(false);
	const { data: journal } = useQuery({
		queryKey: ["shadow-journal", rangeMinutes, narrateJournal],
		queryFn: () => getJournal(rangeMinutes, narrateJournal),
		refetchInterval: narrateJournal ? JOURNAL_NARRATE_POLL_MS : POLL_MS,
	});

	const viewportRef = useRef<HTMLDivElement>(null);
	const laneAreaRef = useRef<HTMLDivElement>(null);
	const viewportWidth = useElementWidth(viewportRef);
	const [scrollLeft, setScrollLeft] = useState(0);
	// Set when a focus request (e.g. from "Search everything") needs the playhead
	// scrolled into view after the range/layout settles on the next render.
	const pendingFocusRef = useRef(false);

	// Track horizontal scroll (rAF-throttled) so lanes can render only the
	// columns currently in view. Programmatic scrolls (playhead auto-follow)
	// fire this too, so virtualization always follows the visible window.
	const rafRef = useRef(0);
	const onScroll = useCallback(() => {
		if (rafRef.current) {
			return;
		}
		rafRef.current = requestAnimationFrame(() => {
			rafRef.current = 0;
			const vp = viewportRef.current;
			if (vp) {
				setScrollLeft(vp.scrollLeft);
			}
		});
	}, []);
	useEffect(
		() => () => {
			if (rafRef.current) {
				cancelAnimationFrame(rafRef.current);
			}
		},
		[]
	);

	// Live right-edge: advance "now" each second so the rightmost column tracks reality.
	useEffect(() => {
		const id = setInterval(() => setNowMicros(Date.now() * 1000), 1000);
		return () => clearInterval(id);
	}, []);

	const end = nowMicros;
	const start = nowMicros - rangeMinutes * MICROS_PER_MIN;
	const rangeMicros = end - start;
	const innerWidth = Math.max(0, viewportWidth - LABEL_W);
	const laneWidth = innerWidth * zoom; // zoom >= 1, so zoom 1 fits the viewport
	const pxPerMicro = laneWidth > 0 ? laneWidth / rangeMicros : 0;
	const clampedPlayhead = clamp(playheadTs, start, end);
	const playheadX = (clampedPlayhead - start) * pxPerMicro;

	// Playback: advance the playhead, stopping at the live edge.
	useEffect(() => {
		if (!playing) {
			return;
		}
		const mult = SPEEDS[speedIdx].mult;
		const id = setInterval(() => {
			setPlayheadTs((p) => {
				const next = p + PLAY_TICK_MS * 1000 * mult;
				if (next >= end) {
					setPlaying(false);
					return end;
				}
				return next;
			});
		}, PLAY_TICK_MS);
		return () => clearInterval(id);
	}, [playing, speedIdx, end]);

	// Keep the playhead in view while playing.
	useEffect(() => {
		if (!playing) {
			return;
		}
		const vp = viewportRef.current;
		if (!vp) {
			return;
		}
		const px = LABEL_W + playheadX;
		const leftEdge = vp.scrollLeft + LABEL_W + 48;
		const rightEdge = vp.scrollLeft + vp.clientWidth - 48;
		if (px < leftEdge || px > rightEdge) {
			vp.scrollLeft = px - vp.clientWidth / 2;
		}
	}, [playheadX, playing]);

	// Group events by track ONCE (ascending by ts, preserved from the backend).
	// Each lane gets its own stable array, so a lane no longer rescans the whole
	// dataset and `memo` on TrackLane can hold.
	const eventsByTrack = useMemo(() => {
		const map = new Map<number, TimelineEvent[]>();
		for (const e of data ?? []) {
			const lane = map.get(e.track);
			if (lane) {
				lane.push(e);
			} else {
				map.set(e.track, [e]);
			}
		}
		return map;
	}, [data]);

	const presentTracks = useMemo(
		() => [...eventsByTrack.keys()].sort((a, b) => a - b),
		[eventsByTrack]
	);

	const filteredEventCount = useMemo(() => {
		let total = 0;
		for (const lane of eventsByTrack.values()) {
			total += lane.length;
		}
		return total;
	}, [eventsByTrack]);

	const seekToClientX = useCallback(
		(clientX: number) => {
			const area = laneAreaRef.current;
			if (!area || pxPerMicro <= 0) {
				return;
			}
			const rect = area.getBoundingClientRect();
			const ts = start + (clientX - rect.left) / pxPerMicro;
			setPlayheadTs(clamp(ts, start, end));
		},
		[start, end, pxPerMicro]
	);

	const onScrubStart = useCallback(
		(e: ReactPointerEvent) => {
			setPlaying(false);
			seekToClientX(e.clientX);
			const move = (ev: globalThis.PointerEvent) => seekToClientX(ev.clientX);
			const up = () => {
				window.removeEventListener("pointermove", move);
				window.removeEventListener("pointerup", up);
			};
			window.addEventListener("pointermove", move);
			window.addEventListener("pointerup", up);
		},
		[seekToClientX]
	);

	// Hover-to-preview: while the toggle is on, no button is pressed, and we're
	// not playing, follow the cursor with the playhead. `e.buttons !== 0` means a
	// scrub drag is in flight — leave that to `onScrubStart`.
	const onHoverSeek = useCallback(
		(e: ReactPointerEvent) => {
			if (!hoverSeek || playing || e.buttons !== 0) {
				return;
			}
			// Ignore the sticky lane-label gutter (the leftmost LABEL_W px of the
			// viewport); hovering it must not yank the playhead to the earliest time.
			const vp = viewportRef.current;
			if (vp && e.clientX < vp.getBoundingClientRect().left + LABEL_W) {
				return;
			}
			seekToClientX(e.clientX);
		},
		[hoverSeek, playing, seekToClientX]
	);

	const jumpBy = useCallback(
		(deltaMicros: number) => {
			setPlaying(false);
			setPlayheadTs((p) => clamp(p + deltaMicros, start, end));
		},
		[start, end]
	);

	// Stable seek handler: a fresh inline arrow per render would defeat the
	// `memo` on each lane. `start`/`end` only move on the 1s now-tick, so this
	// stays referentially stable across the 120ms playback ticks — exactly when
	// the lane memo needs to hold.
	const seekToTs = useCallback(
		(ts: number) => {
			setPlaying(false);
			setPlayheadTs(clamp(ts, start, end));
		},
		[start, end]
	);

	// Jump to a specific captured moment (e.g. opened from the command palette's
	// "Search everything"). The moment can predate the visible window, so widen
	// the range to the smallest option that still covers it before moving the
	// playhead — otherwise it would clamp to the range edge and land at "now".
	const focusTs = useCallback((ts: number) => {
		setPlaying(false);
		const now = Date.now() * 1000;
		setRangeMinutes((prev) => {
			const earliest = now - prev * MICROS_PER_MIN;
			if (ts >= earliest) {
				return prev;
			}
			const neededMinutes = (now - ts) / MICROS_PER_MIN;
			const widened = RANGE_ITEMS.map((item) => Number(item.value)).find(
				(minutes) => minutes >= neededMinutes
			);
			return widened ?? prev;
		});
		setPlayheadTs(ts);
		pendingFocusRef.current = true;
	}, []);

	// After a focus request, scroll the playhead into view once the new range and
	// layout are reflected in `playheadX`. Guarded by the ref so it stays inert on
	// ordinary playhead moves (scrub, playback, jump).
	useEffect(() => {
		if (!pendingFocusRef.current) {
			return;
		}
		const vp = viewportRef.current;
		if (!vp || pxPerMicro <= 0) {
			return;
		}
		pendingFocusRef.current = false;
		vp.scrollLeft = LABEL_W + playheadX - vp.clientWidth / 2;
	}, [playheadX, pxPerMicro]);

	// A deep-link (the command palette's "open captured moment") bakes the target
	// timestamp into the mount context as `window.ryu.context.focusTs` (the desktop
	// page received it via the `ryu:timeline-focus` window event, which cannot cross
	// the sandbox). Read it ONCE at mount and scrub straight there. `focusTs` is
	// referentially stable (empty deps), so this runs exactly once.
	useEffect(() => {
		const ts = focusContextTs();
		if (ts !== null) {
			focusTs(ts);
		}
	}, [focusTs]);

	// Visible lane-local pixel window (with padding), clamped to the lane width.
	// Lanes render only buckets inside this range.
	const visLeftPx = clamp(scrollLeft - VIRTUAL_PAD_PX, 0, laneWidth);
	const visRightPx = clamp(
		scrollLeft + innerWidth + VIRTUAL_PAD_PX,
		0,
		laneWidth
	);

	const showScrubber =
		!(isLoading || isError || data === null) && filteredEventCount > 0;

	// Drag the divider between the player and the lanes to resize the player.
	const onDividerDown = useCallback((e: ReactPointerEvent) => {
		e.preventDefault();
		const startY = e.clientY;
		let startH = PREVIEW_H_DEFAULT;
		setPreviewHeight((h) => {
			startH = h;
			return h;
		});
		const move = (ev: globalThis.PointerEvent) => {
			setPreviewHeight(
				clamp(startH + (ev.clientY - startY), PREVIEW_H_MIN, PREVIEW_H_MAX)
			);
		};
		const up = () => {
			window.removeEventListener("pointermove", move);
			window.removeEventListener("pointerup", up);
		};
		window.addEventListener("pointermove", move);
		window.addEventListener("pointerup", up);
	}, []);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* Range picker — on the desktop this lived in the shell titlebar via
			    `useTitleBar`; a sandboxed companion cannot drive the shell titlebar, so
			    it moves into this compact in-body header (matching every sibling
			    companion, which all render their controls in-body). */}
			<div className="flex h-10 shrink-0 items-center justify-end border-b px-2">
				<Select
					items={RANGE_ITEMS}
					onValueChange={(value: string | null) => {
						if (value !== null) {
							setRangeMinutes(Number(value));
						}
					}}
					value={String(rangeMinutes)}
				>
					<SelectTrigger
						className="w-[140px] border-transparent bg-transparent shadow-none"
						size="sm"
					>
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{RANGE_ITEMS.map((opt) => (
							<SelectItem key={opt.value} value={opt.value}>
								{opt.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Hero preview + transport — only when there's something to scrub */}
			{showScrubber ? (
				<>
					<PreviewPane
						end={end}
						events={data ?? []}
						height={previewHeight}
						playheadTs={clampedPlayhead}
						start={start}
					/>
					<TransportBar
						disabled={false}
						hoverSeek={hoverSeek}
						onJump={jumpBy}
						onNow={() => {
							setPlaying(false);
							setPlayheadTs(end);
						}}
						onSpeed={() => setSpeedIdx((i) => (i + 1) % SPEEDS.length)}
						onToggleHoverSeek={() => setHoverSeek((h) => !h)}
						onTogglePlay={() => setPlaying((p) => !p)}
						onZoomIn={() => setZoom((z) => clamp(z * 2, MIN_ZOOM, MAX_ZOOM))}
						onZoomOut={() => setZoom((z) => clamp(z / 2, MIN_ZOOM, MAX_ZOOM))}
						playheadTs={clampedPlayhead}
						playing={playing}
						speedLabel={SPEEDS[speedIdx].label}
						stepMicros={rangeMicros / 24}
					/>
					<JournalPane
						journal={journal}
						narrate={narrateJournal}
						onOpenReview={() => openReview()}
						onSeek={seekToTs}
						onToggleNarrate={() => setNarrateJournal((v) => !v)}
					/>
					{/* Drag to resize the player above vs. the timeline below */}
					<button
						aria-label="Resize player"
						className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center border-b bg-transparent hover:bg-primary/10"
						onPointerDown={onDividerDown}
						type="button"
					>
						<span className="h-0.5 w-8 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
					</button>
				</>
			) : null}

			{/* Lanes / scrubber */}
			<div
				className="scroll-fade-effect-y relative flex-1 overflow-auto"
				onScroll={onScroll}
				ref={viewportRef}
			>
				{renderBody({
					data,
					filteredEventCount,
					isError,
					isLoading,
					onOpenSettings: () => openSettings(),
					onRetry: () => {
						refetch();
					},
				}) ?? (
					<div
						className="relative flex min-h-full flex-col"
						onPointerMove={onHoverSeek}
						style={{ width: LABEL_W + laneWidth }}
					>
						<Ruler
							labelW={LABEL_W}
							laneWidth={laneWidth}
							onScrubStart={onScrubStart}
							rangeMinutes={rangeMinutes}
							start={start}
							ticks={6}
						/>
						<div className="flex flex-1 flex-col">
							{presentTracks.map((track) => (
								<TrackLane
									events={eventsByTrack.get(track) ?? EMPTY_EVENTS}
									key={track}
									labelW={LABEL_W}
									laneWidth={laneWidth}
									onScrubStart={onScrubStart}
									onSeek={seekToTs}
									pxPerMicro={pxPerMicro}
									start={start}
									track={track}
									visLeftPx={visLeftPx}
									visRightPx={visRightPx}
								/>
							))}
						</div>
						{/* Playhead overlay (aligned to the lane area) */}
						<div
							className="pointer-events-none absolute top-0 bottom-0"
							ref={laneAreaRef}
							style={{ left: LABEL_W, width: laneWidth }}
						>
							<div
								className="absolute top-0 bottom-0 z-40 w-px bg-primary"
								style={{ left: playheadX }}
							>
								<div className="absolute -top-px left-0 size-2.5 -translate-x-1/2 rounded-full bg-primary shadow" />
							</div>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}

/** The loading / error / empty bodies. Returns `null` to fall through to the scrubber. */
function renderBody(props: {
	data: TimelineEvent[] | null | undefined;
	filteredEventCount: number;
	isError: boolean;
	isLoading: boolean;
	onOpenSettings: () => void;
	onRetry: () => void;
}) {
	const {
		data,
		filteredEventCount,
		isError,
		isLoading,
		onOpenSettings,
		onRetry,
	} = props;
	if (isLoading) {
		return (
			<div className="flex h-full items-center justify-center">
				<Spinner />
			</div>
		);
	}
	// A genuine load failure is distinct from "recording is off": show an error
	// with a way to try again, and never fall through to the empty state.
	if (isError) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={Activity01Icon} />
					</EmptyMedia>
					<EmptyTitle>Couldn't load your timeline</EmptyTitle>
					<EmptyDescription>
						Something went wrong loading your recent activity. Check that the
						app is running and try again.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={onRetry} size="sm" variant="outline">
						Try again
					</Button>
				</EmptyContent>
			</Empty>
		);
	}
	if (data === null) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={Activity01Icon} />
					</EmptyMedia>
					<EmptyTitle>Activity recording is off</EmptyTitle>
					<EmptyDescription>
						Turn on activity recording in Settings to capture and replay what
						you were working on.
					</EmptyDescription>
				</EmptyHeader>
				<EmptyContent>
					<Button onClick={onOpenSettings} size="sm" variant="outline">
						Open settings
					</Button>
				</EmptyContent>
			</Empty>
		);
	}
	if (filteredEventCount === 0) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<HugeiconsIcon icon={Files01Icon} />
					</EmptyMedia>
					<EmptyTitle>No activity in this range</EmptyTitle>
					<EmptyDescription>
						Captured events will appear here as you work.
					</EmptyDescription>
				</EmptyHeader>
			</Empty>
		);
	}
	return null;
}

/** Hero pane: the keyframe at the playhead when one exists, else a rich context card. */
const PreviewPane = memo(function PreviewPane(props: {
	end: number;
	events: TimelineEvent[];
	height: number;
	playheadTs: number;
	start: number;
}) {
	const { events, height, playheadTs } = props;

	// `events` is ascending by ts — a single upper-bound search gives the slice
	// boundary, so both reads below are O(log n) instead of O(n log n) on every
	// 120ms playback tick.
	const upper = useMemo(
		() => upperBoundByTs(events, playheadTs),
		[events, playheadTs]
	);

	// Latest window/app context at or before the playhead: scan back from the
	// boundary for the first named event (= the most recent one).
	const context = useMemo(() => {
		for (let i = upper - 1; i >= 0; i--) {
			const e = events[i];
			if (e.window_title || e.app_name) {
				return e;
			}
		}
		return null;
	}, [events, upper]);

	// Up to 6 most-recent events at/before the playhead, newest first.
	const recent = useMemo(
		() => events.slice(Math.max(0, upper - 6), upper).reverse(),
		[events, upper]
	);

	// Debounce the keyframe bucket: at 60× playback the playhead jumps ~7s/tick,
	// so without this the frame would remount and refetch every 120ms.
	const frameBucket = useDebounced(Math.floor(playheadTs / 1_000_000), 200);
	const frameSrc = useFrameDataUrl(frameBucket * 1_000_000);

	return (
		<div
			className="flex shrink-0 gap-3 border-b bg-black/30 p-3"
			style={{ height }}
		>
			{/* Frame / placeholder — keyed by bucket so its load state resets per second */}
			<FrameThumb key={frameBucket} playheadTs={playheadTs} src={frameSrc} />

			{/* Context — a borderless card; its background alone separates it from the canvas */}
			<div className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-3">
				<div className="min-w-0">
					<div className="truncate font-semibold text-base">
						{context?.app_name || "Idle"}
					</div>
					<div className="truncate text-muted-foreground text-sm">
						{context?.window_title ||
							context?.url ||
							"No active window at this moment"}
					</div>
				</div>
				<div className="mt-1 flex min-h-0 flex-1 flex-col gap-1 overflow-auto">
					<span className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
						Around this moment
					</span>
					{recent.length === 0 ? (
						<span className="text-muted-foreground text-xs">
							Nothing captured yet.
						</span>
					) : (
						recent.map((e) => {
							const meta = trackMeta(e.track);
							return (
								<div
									className="flex items-center gap-2 text-xs"
									key={`${e.ts}-${e.track}-${e.event_type}`}
								>
									<span className="w-16 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
										{formatClock(e.ts)}
									</span>
									<span
										className={`shrink-0 rounded px-1.5 py-0.5 font-medium text-[10px] ${meta.tint}`}
									>
										{meta.label}
									</span>
									<span className="truncate">{eventLabel(e)}</span>
								</div>
							);
						})
					)}
				</div>
			</div>
		</div>
	);
});

/**
 * The keyframe thumbnail at the playhead. Remounted (via a `key` on the bucket)
 * each second so its loaded/failed state resets cleanly. `src` is a host-fetched
 * `data:` URL (or `null` when no keyframe exists near that moment — frame capture
 * off/paused, or nothing recorded yet), in which case the placeholder shows.
 */
const FrameThumb = memo(function FrameThumb(props: {
	playheadTs: number;
	src: string | null;
}) {
	const { playheadTs, src } = props;
	const [loaded, setLoaded] = useState(false);
	return (
		<div className="relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
			{/* biome-ignore lint/performance/noImgElement: keyframe is a data: URL the host resolved from the local Shadow sidecar, not a bundled asset */}
			{/* biome-ignore lint/a11y/noNoninteractiveElementInteractions: load/error handlers drive the graceful fallback */}
			{src ? (
				<img
					alt="Screen at playhead"
					className={loaded ? "h-full w-full object-contain" : "hidden"}
					height={360}
					onError={() => setLoaded(false)}
					onLoad={() => setLoaded(true)}
					src={src}
					width={640}
				/>
			) : null}
			{loaded && src ? null : (
				<div className="flex flex-col items-center gap-1.5 text-muted-foreground">
					<HugeiconsIcon className="size-7 opacity-50" icon={Image01Icon} />
					<span className="px-3 text-center text-[11px] leading-tight">
						No frame recorded
					</span>
				</div>
			)}
			<span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-[11px] text-white tabular-nums">
				{formatClock(playheadTs)}
			</span>
		</div>
	);
});

/** Dayflow-inspired work journal: derived cards + standup draft from Shadow. */
const JournalPane = memo(function JournalPane(props: {
	journal: JournalSnapshot | null | undefined;
	narrate: boolean;
	onOpenReview: () => void;
	onSeek: (ts: number) => void;
	onToggleNarrate: () => void;
}) {
	const { journal, narrate, onOpenReview, onSeek, onToggleNarrate } = props;
	if (!journal || journal.cards.length === 0) {
		return null;
	}

	return (
		<div className="grid shrink-0 gap-3 border-b bg-background px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
			<div className="min-w-0">
				<div className="mb-2 flex items-center justify-between gap-2">
					<div className="font-semibold text-sm">Work journal</div>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-xs">
							{journal.cards.length} cards
						</span>
						<Button
							onClick={onToggleNarrate}
							size="sm"
							title="Rewrite card titles and summaries with AI (routed through the gateway)"
							variant={narrate ? "secondary" : "ghost"}
						>
							<HugeiconsIcon icon={SparklesIcon} />
							{narrate ? "AI on" : "Polish with AI"}
						</Button>
						<Button onClick={onOpenReview} size="sm" variant="ghost">
							Weekly review
							<HugeiconsIcon icon={ArrowRight01Icon} />
						</Button>
					</div>
				</div>
				<div className="flex gap-2 overflow-x-auto pb-1">
					{journal.cards.slice(0, 8).map((card) => (
						<JournalCardButton card={card} key={card.id} onSeek={onSeek} />
					))}
				</div>
			</div>
			<div className="grid min-w-0 gap-2">
				<FocusSummary focus={journal.focus} />
				<div className="grid grid-cols-3 gap-2">
					<StandupColumn
						items={journal.standup.highlights}
						title="Highlights"
					/>
					<StandupColumn items={journal.standup.tasks} title="Follow-ups" />
					<StandupColumn items={journal.standup.blockers} title="Blockers" />
				</div>
				<div className="grid grid-cols-2 gap-2">
					<StatList stats={journal.categories} title="Categories" />
					<StatList stats={journal.apps} title="Apps" />
				</div>
			</div>
		</div>
	);
});

const JournalCardButton = memo(function JournalCardButton(props: {
	card: JournalCard;
	onSeek: (ts: number) => void;
}) {
	const { card, onSeek } = props;
	return (
		<button
			className="flex h-24 w-64 shrink-0 flex-col rounded-lg border bg-muted/30 p-3 text-left transition-colors hover:bg-muted"
			onClick={() => onSeek(card.start_ts)}
			type="button"
		>
			<div className="mb-1 flex items-center gap-2">
				<span
					className={`size-2 shrink-0 rounded-full ${
						card.distraction ? "bg-warning" : "bg-primary"
					}`}
				/>
				<span className="truncate font-medium text-xs">{card.category}</span>
				<span className="ml-auto shrink-0 text-muted-foreground text-xs">
					{formatMinutes(card.end_ts - card.start_ts)}
				</span>
			</div>
			<div className="line-clamp-2 font-medium text-sm leading-snug">
				{card.title}
			</div>
			<div className="mt-auto truncate text-muted-foreground text-xs">
				{card.summary}
			</div>
		</button>
	);
});

function StandupColumn(props: { items: string[]; title: string }) {
	const { items, title } = props;
	return (
		<div className="min-w-0 rounded-lg bg-muted/30 p-3">
			<div className="mb-2 font-semibold text-xs">{title}</div>
			<ul className="space-y-1.5">
				{items.slice(0, 3).map((item) => (
					<li className="line-clamp-2 text-muted-foreground text-xs" key={item}>
						{item}
					</li>
				))}
			</ul>
		</div>
	);
}

function StatList(props: { stats: JournalSnapshot["apps"]; title: string }) {
	const { stats, title } = props;
	return (
		<div className="min-w-0 rounded-lg bg-muted/30 p-3">
			<div className="mb-1.5 font-semibold text-xs">{title}</div>
			<div className="space-y-1">
				{stats.slice(0, 3).map((stat) => (
					<div className="flex items-center gap-2 text-xs" key={stat.name}>
						<span className="truncate text-muted-foreground">{stat.name}</span>
						<span className="ml-auto shrink-0 font-mono tabular-nums">
							{stat.minutes}m
						</span>
					</div>
				))}
			</div>
		</div>
	);
}

function formatMinutes(durationUs: number): string {
	const minutes = Math.max(1, Math.round(durationUs / MICROS_PER_MIN));
	return `${minutes}m`;
}

/** Transport controls: play/pause, step, jump-to-now, zoom, speed, and clock. */
const TransportBar = memo(function TransportBar(props: {
	disabled: boolean;
	hoverSeek: boolean;
	onJump: (deltaMicros: number) => void;
	onNow: () => void;
	onSpeed: () => void;
	onToggleHoverSeek: () => void;
	onTogglePlay: () => void;
	onZoomIn: () => void;
	onZoomOut: () => void;
	playheadTs: number;
	playing: boolean;
	speedLabel: string;
	stepMicros: number;
}) {
	const {
		disabled,
		hoverSeek,
		onJump,
		onNow,
		onSpeed,
		onToggleHoverSeek,
		onTogglePlay,
		onZoomIn,
		onZoomOut,
		playheadTs,
		playing,
		speedLabel,
		stepMicros,
	} = props;
	return (
		<div className="flex shrink-0 items-center gap-1.5 border-b px-4 py-2">
			<Button
				disabled={disabled}
				onClick={() => onJump(-stepMicros)}
				size="icon"
				variant="ghost"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} />
			</Button>
			<Button
				disabled={disabled}
				onClick={onTogglePlay}
				size="icon"
				variant={playing ? "default" : "outline"}
			>
				{playing ? <PauseGlyph /> : <HugeiconsIcon icon={PlayIcon} />}
			</Button>
			<Button
				disabled={disabled}
				onClick={() => onJump(stepMicros)}
				size="icon"
				variant="ghost"
			>
				<HugeiconsIcon icon={ArrowRight01Icon} />
			</Button>
			<Button
				className="gap-1.5"
				disabled={disabled}
				onClick={onNow}
				size="sm"
				variant="ghost"
			>
				<HugeiconsIcon className="size-3.5" icon={RotateClockwiseIcon} />
				Now
			</Button>

			<div className="mx-1 flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm tabular-nums">
				<HugeiconsIcon className="size-3.5 opacity-60" icon={Clock01Icon} />
				{formatClock(playheadTs)}
			</div>

			<div className="ml-auto flex items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								className="gap-1.5"
								disabled={disabled}
								onClick={onToggleHoverSeek}
								size="sm"
								variant={hoverSeek ? "default" : "outline"}
							>
								<HugeiconsIcon className="size-3.5" icon={Activity01Icon} />
								Hover
							</Button>
						}
					/>
					<TooltipContent>
						{hoverSeek
							? "Hover preview on: move the line by hovering the timeline"
							: "Hover preview off: move the line only by clicking"}
					</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								aria-label={`Playback speed ${speedLabel}. Click to change.`}
								className="w-12"
								disabled={disabled}
								onClick={onSpeed}
								size="sm"
								variant="outline"
							>
								{speedLabel}
							</Button>
						}
					/>
					<TooltipContent>Playback speed — click to cycle</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								aria-label="Zoom out"
								disabled={disabled}
								onClick={onZoomOut}
								size="icon"
								variant="ghost"
							>
								<span className="font-semibold text-base leading-none">−</span>
							</Button>
						}
					/>
					<TooltipContent>Zoom out</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						render={
							<Button
								aria-label="Zoom in"
								disabled={disabled}
								onClick={onZoomIn}
								size="icon"
								variant="ghost"
							>
								<span className="font-semibold text-base leading-none">+</span>
							</Button>
						}
					/>
					<TooltipContent>Zoom in</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
});

/** Inline pause glyph (avoids depending on a specific icon export name). */
function PauseGlyph() {
	return (
		<svg
			aria-hidden="true"
			className="size-4"
			fill="currentColor"
			viewBox="0 0 24 24"
		>
			<rect height="14" rx="1" width="4" x="6" y="5" />
			<rect height="14" rx="1" width="4" x="14" y="5" />
		</svg>
	);
}

/** Time ruler with evenly spaced tick labels; doubles as a scrub strip. */
const Ruler = memo(function Ruler(props: {
	labelW: number;
	laneWidth: number;
	onScrubStart: (e: ReactPointerEvent) => void;
	rangeMinutes: number;
	start: number;
	ticks: number;
}) {
	const { labelW, laneWidth, onScrubStart, rangeMinutes, start, ticks } = props;
	const rangeMicros = rangeMinutes * MICROS_PER_MIN;
	const marks = Array.from({ length: ticks + 1 }, (_, i) => {
		const frac = i / ticks;
		return { frac, ts: start + frac * rangeMicros };
	});
	return (
		<div className="sticky top-0 z-30 flex h-7 border-b bg-background/95 backdrop-blur">
			<div className="shrink-0 border-r" style={{ width: labelW }} />
			<button
				aria-label="Scrub timeline"
				className="relative h-full cursor-ew-resize"
				onPointerDown={onScrubStart}
				style={{ width: laneWidth }}
				type="button"
			>
				{marks.map((m) => (
					<span
						className="absolute top-0 flex h-full items-center border-border/60 border-l pl-1 font-mono text-[10px] text-muted-foreground tabular-nums"
						key={m.frac}
						style={{ left: `${m.frac * 100}%` }}
					>
						{m.frac < 1 ? formatTick(m.ts, rangeMinutes) : ""}
					</span>
				))}
			</button>
		</div>
	);
});

/** A rendered tick: one per occupied pixel-bucket inside the visible window. */
interface LaneTick {
	/** How many events collapsed into this bucket. */
	count: number;
	/** Label of the representative event. */
	label: string;
	/** Lane-local left offset in px (bucket-aligned). */
	left: number;
	/** Timestamp of the representative (first) event in the bucket. */
	ts: number;
}

/**
 * Compute the visible ticks for a lane by **binning**: events are bucketed into
 * `TICK_BUCKET_PX`-wide columns and at most one tick is emitted per bucket. Node
 * count is therefore bounded by visible pixels, never by event count — the
 * load-bearing fix for dense ranges. `events` is ascending by `ts`, so a binary
 * search finds the visible window and a single monotonic pass does the rest.
 */
function binLaneTicks(
	events: TimelineEvent[],
	start: number,
	pxPerMicro: number,
	visLeftPx: number,
	visRightPx: number
): LaneTick[] {
	if (pxPerMicro <= 0 || events.length === 0) {
		return [];
	}
	const tsMin = start + visLeftPx / pxPerMicro;
	const tsMax = start + visRightPx / pxPerMicro;
	const out: LaneTick[] = [];
	let last: LaneTick | null = null;
	let lastBucket = -1;
	for (let i = lowerBoundByTs(events, tsMin); i < events.length; i++) {
		const e = events[i];
		if (e.ts > tsMax) {
			break;
		}
		const leftPx = (e.ts - start) * pxPerMicro;
		const bucket = Math.floor(leftPx / TICK_BUCKET_PX);
		if (last && bucket === lastBucket) {
			last.count++;
			continue;
		}
		lastBucket = bucket;
		last = {
			count: 1,
			label: eventLabel(e),
			left: bucket * TICK_BUCKET_PX,
			ts: e.ts,
		};
		out.push(last);
	}
	return out;
}

/** One capture lane: a sticky label and a strip of time-positioned event ticks. */
const TrackLane = memo(function TrackLane(props: {
	events: TimelineEvent[];
	labelW: number;
	laneWidth: number;
	onScrubStart: (e: ReactPointerEvent) => void;
	onSeek: (ts: number) => void;
	pxPerMicro: number;
	start: number;
	track: number;
	visLeftPx: number;
	visRightPx: number;
}) {
	const {
		events,
		labelW,
		laneWidth,
		onScrubStart,
		onSeek,
		pxPerMicro,
		start,
		track,
		visLeftPx,
		visRightPx,
	} = props;
	const meta = trackMeta(track);
	const ticks = useMemo(
		() => binLaneTicks(events, start, pxPerMicro, visLeftPx, visRightPx),
		[events, start, pxPerMicro, visLeftPx, visRightPx]
	);
	return (
		<div className="flex min-h-9 flex-1 items-stretch border-b">
			<div
				className="sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3"
				style={{ width: labelW }}
			>
				<span className={`size-2 rounded-full ${meta.bar}`} />
				<span className="truncate font-medium text-xs">{meta.label}</span>
			</div>
			<button
				aria-label={`${meta.label} lane`}
				className="relative cursor-ew-resize self-stretch bg-muted/10"
				onPointerDown={onScrubStart}
				style={{ width: laneWidth }}
				type="button"
			>
				{ticks.map((t) => (
					<Tooltip key={t.left}>
						<TooltipTrigger
							render={
								<span
									className={`absolute top-1.5 bottom-1.5 w-[3px] rounded-sm ${meta.bar} opacity-70 transition-opacity hover:opacity-100`}
									onPointerDown={(ev) => {
										ev.stopPropagation();
										onSeek(t.ts);
									}}
									style={{ left: t.left }}
								/>
							}
						/>
						<TooltipContent>
							{t.count > 1
								? `${formatClock(t.ts)} — ${t.count} events`
								: `${formatClock(t.ts)} — ${t.label}`}
						</TooltipContent>
					</Tooltip>
				))}
			</button>
		</div>
	);
});
