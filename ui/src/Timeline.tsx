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

import { Button } from "@ryu/ui/components/button.tsx";
import { useQuery } from "@ryu/ui/hooks/use-query.ts";
import { useViewClock } from "@ryu/ui/hooks/use-view-clock.ts";
import {
	type PointerEvent as ReactPointerEvent,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import {
	focusContextTs,
	getJournal,
	getTimeline,
	openReview,
	openSettings,
} from "./bridge.ts";
import { renderBody } from "./Timeline-body.tsx";
import { TimelineHeader } from "./Timeline-header.tsx";
import { TimelineView } from "./Timeline-history-view.tsx";
import { useElementWidth } from "./Timeline-hooks.ts";
import { JournalPane } from "./Timeline-journal-pane.tsx";
import {
	clamp,
	HOVER_SEEK_KEY,
	JOURNAL_NARRATE_POLL_MS,
	LABEL_W,
	MAX_ZOOM,
	MICROS_PER_MIN,
	MIN_ZOOM,
	PLAY_TICK_MS,
	POLL_MS,
	PREVIEW_H_DEFAULT,
	PREVIEW_H_MAX,
	PREVIEW_H_MIN,
	RANGE_ITEMS,
	SPEEDS,
	VIRTUAL_PAD_PX,
} from "./Timeline-model.ts";
import { PreviewPane } from "./Timeline-preview.tsx";
import { ReplayLanes } from "./Timeline-replay-lanes.tsx";
import { TransportBar } from "./Timeline-transport.tsx";
import type { TimelineEvent } from "./types.ts";

export function Timeline() {
	const [viewMode, setViewMode] = useState<"replay" | "timeline">("replay");
	const [rangeMinutes, setRangeMinutes] = useState<number>(60);
	const [zoom, setZoom] = useState(1);
	const [playing, setPlaying] = useState(false);
	const [speedIdx, setSpeedIdx] = useState(2);
	const [playheadTs, setPlayheadTs] = useState<number>(() => Date.now() * 1000);
	const nowMicros = useViewClock(1000, playing) * 1000;
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
	const {
		data: journal,
		isError: isJournalError,
		isFetching: isJournalFetching,
		refetch: refetchJournal,
	} = useQuery({
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

	const openMomentInReplay = useCallback(
		(ts: number) => {
			setViewMode("replay");
			seekToTs(ts);
		},
		[seekToTs]
	);

	const bodyState = renderBody({
		data,
		filteredEventCount,
		isError,
		isLoading,
		onOpenSettings: () => openSettings(),
		onRetry: () => {
			refetch();
		},
	});

	return (
		<div className="flex h-full flex-col overflow-hidden">
			{/* The current scrubber stays the default; the second mode is a
			    chronological History-style feed over the same captured data. */}
			<TimelineHeader
				rangeMinutes={rangeMinutes}
				setRangeMinutes={setRangeMinutes}
				setViewMode={setViewMode}
				viewMode={viewMode}
			/>

			{viewMode === "timeline" ? (
				<div className="relative flex-1 overflow-auto">
					{bodyState ?? (
						<TimelineView
							data={data ?? []}
							journal={journal}
							onOpenInReplay={openMomentInReplay}
						/>
					)}
				</div>
			) : (
				<>
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
								onZoomIn={() =>
									setZoom((z) => clamp(z * 2, MIN_ZOOM, MAX_ZOOM))
								}
								onZoomOut={() =>
									setZoom((z) => clamp(z / 2, MIN_ZOOM, MAX_ZOOM))
								}
								playheadTs={clampedPlayhead}
								playing={playing}
								speedLabel={SPEEDS[speedIdx].label}
								stepMicros={rangeMicros / 24}
							/>
							<JournalPane
								isError={isJournalError}
								isFetching={isJournalFetching}
								journal={journal}
								narrate={narrateJournal}
								onOpenReview={() => openReview()}
								onRetry={() => {
									refetchJournal();
								}}
								onSeek={seekToTs}
								onToggleNarrate={() => setNarrateJournal((v) => !v)}
							/>
							{/* Drag to resize the player above vs. the timeline below */}
							<Button
								aria-label="Resize player"
								className="group flex h-1.5 shrink-0 cursor-row-resize items-center justify-center"
								onPointerDown={onDividerDown}
								type="button"
								variant="ghost"
							>
								<span className="h-0.5 w-8 rounded-full bg-border transition-colors group-hover:bg-primary/50" />
							</Button>
						</>
					) : null}

					{/* Lanes / scrubber */}
					<div
						className="scroll-fade-effect-y relative flex-1 overflow-auto"
						onScroll={onScroll}
						ref={viewportRef}
					>
						{bodyState ?? (
							<ReplayLanes
								eventsByTrack={eventsByTrack}
								laneAreaRef={laneAreaRef}
								laneWidth={laneWidth}
								onHoverSeek={onHoverSeek}
								onScrubStart={onScrubStart}
								playheadX={playheadX}
								presentTracks={presentTracks}
								pxPerMicro={pxPerMicro}
								rangeMinutes={rangeMinutes}
								seekToTs={seekToTs}
								start={start}
								visLeftPx={visLeftPx}
								visRightPx={visRightPx}
							/>
						)}
					</div>
				</>
			)}
		</div>
	);
}
