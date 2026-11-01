import { Image01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { safeMediaUrl } from "@ryu/ui/lib/safe-media-url.ts";
import { memo, useMemo, useState } from "react";
import { useDebounced, useFrameDataUrl } from "./Timeline-hooks.ts";
import { formatClock, trackMeta, upperBoundByTs } from "./Timeline-model.ts";
import type { TimelineStyle } from "./timeline-style.ts";
import { eventLabel } from "./timeline-view.ts";
import type { TimelineEvent } from "./types.ts";

/** Hero pane: the keyframe at the playhead when one exists, else a rich context card. */
export const PreviewPane = memo(function PreviewPane(props: {
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
			data-timeline-preview-pane
			style={
				{ "--timeline-preview-height": `${height}px` } satisfies TimelineStyle
			}
		>
			{/* Frame / placeholder — keyed by bucket so its load state resets per second */}
			<FrameThumb key={frameBucket} playheadTs={playheadTs} src={frameSrc} />

			{/* Context — a borderless card; its background alone separates it from the canvas */}
			<div className="flex w-72 shrink-0 flex-col gap-2 rounded-lg bg-muted/40 p-3">
				<div className="min-w-0">
					<div
						className="truncate font-medium text-base"
						title={context?.app_name || "Idle"}
					>
						{context?.app_name || "Idle"}
					</div>
					<div
						className="truncate text-muted-foreground text-sm"
						title={
							context?.window_title ||
							context?.url ||
							"No active window at this moment"
						}
					>
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
									<span className="w-16 shrink-0 font-mono text-muted-foreground text-xs tabular-nums">
										{formatClock(e.ts)}
									</span>
									<span
										className={`shrink-0 rounded px-1.5 py-0.5 font-medium text-xs ${meta.tint}`}
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
export const FrameThumb = memo(function FrameThumb(props: {
	playheadTs: number;
	src: string | null;
}) {
	const { playheadTs, src } = props;
	const safeSrc = safeMediaUrl(src);
	const [loaded, setLoaded] = useState(false);
	return (
		<div className="relative flex h-full min-w-0 flex-1 items-center justify-center overflow-hidden rounded-lg bg-black">
			{safeSrc ? (
				<img
					alt="Screen at playhead"
					className={loaded ? "h-full w-full object-contain" : "hidden"}
					height={360}
					onError={() => setLoaded(false)}
					onLoad={() => setLoaded(true)}
					src={safeSrc}
					width={640}
				/>
			) : null}
			{loaded && safeSrc ? null : (
				<div className="flex flex-col items-center gap-1.5 text-muted-foreground">
					<HugeiconsIcon className="size-7 opacity-50" icon={Image01Icon} />
					<span className="px-3 text-center text-xs leading-tight">
						No frame recorded
					</span>
				</div>
			)}
			<span className="absolute bottom-1.5 left-1.5 rounded bg-black/60 px-1.5 py-0.5 font-mono text-white text-xs tabular-nums">
				{formatClock(playheadTs)}
			</span>
		</div>
	);
});
