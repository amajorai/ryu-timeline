import { PlayIcon, TimelineListIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@ryu/ui/components/select.tsx";
import {
	ToggleGroup,
	ToggleGroupItem,
} from "@ryu/ui/components/toggle-group.tsx";
import { RANGE_ITEMS } from "./Timeline-model.ts";

/** The in-body header: title, the replay/timeline view toggle, and the range picker. */
export function TimelineHeader(props: {
	rangeMinutes: number;
	setRangeMinutes: (minutes: number) => void;
	setViewMode: (mode: "replay" | "timeline") => void;
	viewMode: "replay" | "timeline";
}) {
	const { rangeMinutes, setRangeMinutes, setViewMode, viewMode } = props;
	return (
		<div className="flex min-h-12 shrink-0 flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
			<div className="min-w-0">
				<div className="font-medium text-sm">Timeline</div>
				<div className="truncate text-muted-foreground text-xs">
					{viewMode === "replay"
						? "Replay captured activity"
						: "Browse activity chronologically"}
				</div>
			</div>
			<div className="flex items-center gap-2">
				<ToggleGroup
					aria-label="Timeline view"
					onValueChange={(values: string[]) => {
						const next = values[0];
						if (next === "replay" || next === "timeline") {
							setViewMode(next);
						}
					}}
					size="sm"
					spacing={0}
					value={[viewMode]}
					variant="outline"
				>
					<ToggleGroupItem aria-label="Replay view" value="replay">
						<HugeiconsIcon className="size-3.5" icon={PlayIcon} />
						Replay
					</ToggleGroupItem>
					<ToggleGroupItem aria-label="Timeline view" value="timeline">
						<HugeiconsIcon className="size-3.5" icon={TimelineListIcon} />
						Timeline
					</ToggleGroupItem>
				</ToggleGroup>
				<Select
					items={RANGE_ITEMS}
					onValueChange={(value: string | null) => {
						if (value !== null) {
							setRangeMinutes(Number(value));
						}
					}}
					value={String(rangeMinutes)}
				>
					<SelectTrigger className="w-36" size="sm">
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
		</div>
	);
}
