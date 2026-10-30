import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ryu/ui/components/tooltip.tsx";
import { memo, type PointerEvent as ReactPointerEvent, useMemo } from "react";
import {
	formatClock,
	formatTick,
	lowerBoundByTs,
	MICROS_PER_MIN,
	TICK_BUCKET_PX,
	trackMeta,
} from "./Timeline-model.ts";
import styles from "./timeline-style.module.css";
import type { TimelineStyle } from "./timeline-style.ts";
import { eventLabel } from "./timeline-view.ts";
import type { TimelineEvent } from "./types.ts";

/** Time ruler with evenly spaced tick labels; doubles as a scrub strip. */
export const Ruler = memo(function Ruler(props: {
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
			<div
				className={`${styles.width} shrink-0 border-r`}
				style={{ "--timeline-width": `${labelW}px` } satisfies TimelineStyle}
			/>
			<Button
				aria-label="Scrub timeline"
				className="relative h-full cursor-ew-resize"
				data-timeline-width
				onPointerDown={onScrubStart}
				style={{ "--timeline-width": `${laneWidth}px` } satisfies TimelineStyle}
				type="button"
				variant="ghost"
			>
				{marks.map((m) => (
					<span
						className={`${styles.left} absolute top-0 flex h-full items-center border-border/60 border-l pl-1 font-mono text-muted-foreground text-xs tabular-nums`}
						key={m.frac}
						style={
							{ "--timeline-left": `${m.frac * 100}%` } satisfies TimelineStyle
						}
					>
						{m.frac < 1 ? formatTick(m.ts, rangeMinutes) : ""}
					</span>
				))}
			</Button>
		</div>
	);
});

/** A rendered tick: one per occupied pixel-bucket inside the visible window. */
export interface LaneTick {
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
export function binLaneTicks(
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
export const TrackLane = memo(function TrackLane(props: {
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
	const tl = useLiteralMessages();
	const meta = trackMeta(track);
	const ticks = useMemo(
		() => binLaneTicks(events, start, pxPerMicro, visLeftPx, visRightPx),
		[events, start, pxPerMicro, visLeftPx, visRightPx]
	);
	return (
		<div className="flex min-h-9 flex-1 items-stretch border-b">
			<div
				className={`${styles.width} sticky left-0 z-10 flex shrink-0 items-center gap-2 border-r bg-background px-3`}
				style={{ "--timeline-width": `${labelW}px` } satisfies TimelineStyle}
			>
				<span className={`size-2 rounded-full ${meta.bar}`} />
				<span className="truncate font-medium text-xs" title={meta.label}>
					{meta.label}
				</span>
			</div>
			<div
				aria-label={tl("{label} lane", { label: meta.label })}
				className={`${styles.width} relative cursor-ew-resize self-stretch`}
				onPointerDown={onScrubStart}
				role="group"
				style={{ "--timeline-width": `${laneWidth}px` } satisfies TimelineStyle}
			>
				{ticks.map((t) => (
					<Tooltip key={t.left}>
						<TooltipTrigger
							delay={0}
							render={
								<button
									aria-label={tl("{label} event {event} at {time}", {
										event: t.label,
										label: meta.label,
										time: formatClock(t.ts),
									})}
									className={`${styles.left} absolute top-1.5 bottom-1.5 w-[3px] rounded-sm ${meta.bar} opacity-70 transition-opacity hover:opacity-100`}
									onClick={() => onSeek(t.ts)}
									onPointerDown={(ev) => ev.stopPropagation()}
									style={
										{ "--timeline-left": `${t.left}px` } satisfies TimelineStyle
									}
									title={`${formatClock(t.ts)} — ${t.label}`}
									type="button"
								/>
							}
						/>
						<TooltipContent>
							{t.count > 1
								? tl("{time} — {count} events", {
										count: String(t.count),
										time: formatClock(t.ts),
									})
								: `${formatClock(t.ts)} — ${t.label}`}
						</TooltipContent>
					</Tooltip>
				))}
			</div>
		</div>
	);
});
