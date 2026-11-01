import {
	Activity01Icon,
	ArrowLeft01Icon,
	ArrowRight01Icon,
	Clock01Icon,
	PlayIcon,
	RotateClockwiseIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import {
	Tooltip,
	TooltipContent,
	TooltipTrigger,
} from "@ryu/ui/components/tooltip.tsx";
import { memo } from "react";
import { formatClock } from "./Timeline-model.ts";

/** Transport controls: play/pause, step, jump-to-now, zoom, speed, and clock. */
export const TransportBar = memo(function TransportBar(props: {
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
	const tl = useLiteralMessages();
	return (
		<div
			aria-label="Playback position"
			className="flex shrink-0 items-center gap-1.5 border-b px-4 py-2"
			role="group"
		>
			<Button
				aria-label="Step backward"
				disabled={disabled}
				onClick={() => onJump(-stepMicros)}
				size="icon"
				variant="ghost"
			>
				<HugeiconsIcon icon={ArrowLeft01Icon} />
			</Button>
			<Button
				aria-label={playing ? "Pause" : "Play"}
				disabled={disabled}
				onClick={onTogglePlay}
				size="icon"
				variant={playing ? "default" : "outline"}
			>
				{playing ? <PauseGlyph /> : <HugeiconsIcon icon={PlayIcon} />}
			</Button>
			<Button
				aria-label="Step forward"
				disabled={disabled}
				onClick={() => onJump(stepMicros)}
				size="icon"
				variant="ghost"
			>
				<HugeiconsIcon icon={ArrowRight01Icon} />
			</Button>
			<Button disabled={disabled} onClick={onNow} size="sm" variant="ghost">
				<HugeiconsIcon className="size-3.5" icon={RotateClockwiseIcon} />
				Now
			</Button>

			<div
				aria-label="Playback time"
				className="mx-1 flex items-center gap-1.5 rounded-md border px-2 py-1 font-mono text-sm tabular-nums"
				role="timer"
			>
				<HugeiconsIcon className="size-3.5 opacity-60" icon={Clock01Icon} />
				{formatClock(playheadTs)}
			</div>

			<div className="ml-auto flex items-center gap-1.5">
				<Tooltip>
					<TooltipTrigger
						delay={0}
						render={
							<Button
								aria-pressed={hoverSeek}
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
						delay={0}
						render={
							<Button
								aria-label={tl(
									"Playback speed {speedLabel}. Click to change.",
									{
										speedLabel,
									}
								)}
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
						delay={0}
						render={
							<Button
								aria-label="Zoom out"
								disabled={disabled}
								onClick={onZoomOut}
								size="icon"
								variant="ghost"
							>
								<span className="font-medium text-base leading-none">−</span>
							</Button>
						}
					/>
					<TooltipContent>Zoom out</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger
						delay={0}
						render={
							<Button
								aria-label="Zoom in"
								disabled={disabled}
								onClick={onZoomIn}
								size="icon"
								variant="ghost"
							>
								<span className="font-medium text-base leading-none">+</span>
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
export function PauseGlyph() {
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
