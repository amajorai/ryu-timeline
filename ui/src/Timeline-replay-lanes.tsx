import type { PointerEvent as ReactPointerEvent, RefObject } from "react";
import { Ruler, TrackLane } from "./Timeline-lanes.tsx";
import { EMPTY_EVENTS, LABEL_W } from "./Timeline-model.ts";
import styles from "./timeline-style.module.css";
import type { TimelineStyle } from "./timeline-style.ts";
import type { TimelineEvent } from "./types.ts";

/** The replay scrubber canvas: ruler, one lane per present track, and the playhead overlay. */
export function ReplayLanes(props: {
	eventsByTrack: Map<number, TimelineEvent[]>;
	laneAreaRef: RefObject<HTMLDivElement | null>;
	laneWidth: number;
	onHoverSeek: (e: ReactPointerEvent) => void;
	onScrubStart: (e: ReactPointerEvent) => void;
	playheadX: number;
	presentTracks: number[];
	pxPerMicro: number;
	rangeMinutes: number;
	seekToTs: (ts: number) => void;
	start: number;
	visLeftPx: number;
	visRightPx: number;
}) {
	const {
		eventsByTrack,
		laneAreaRef,
		laneWidth,
		onHoverSeek,
		onScrubStart,
		playheadX,
		presentTracks,
		pxPerMicro,
		rangeMinutes,
		seekToTs,
		start,
		visLeftPx,
		visRightPx,
	} = props;
	return (
		<div
			className={`${styles.width} relative flex min-h-full flex-col`}
			onPointerMove={onHoverSeek}
			style={
				{
					"--timeline-width": `${LABEL_W + laneWidth}px`,
				} satisfies TimelineStyle
			}
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
				data-timeline-lane-region
				ref={laneAreaRef}
				style={
					{
						"--timeline-label-width": `${LABEL_W}px`,
						"--timeline-lane-width": `${laneWidth}px`,
					} satisfies TimelineStyle
				}
			>
				<div
					className="absolute top-0 bottom-0 z-40 w-px bg-primary"
					data-timeline-playhead
					style={
						{
							"--timeline-playhead-offset": `${playheadX}px`,
						} satisfies TimelineStyle
					}
				>
					<div className="absolute -top-px left-0 size-2.5 -translate-x-1/2 rounded-full bg-primary shadow" />
				</div>
			</div>
		</div>
	);
}
