import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { memo, useMemo } from "react";
import { AppIconStack } from "./AppIconStack.tsx";
import { formatClock, formatMinutes, trackMeta } from "./Timeline-model.ts";
import {
	eventLabel,
	formatEventType,
	groupJournalCards,
	groupTimelineEvents,
} from "./timeline-view.ts";
import type { JournalCard, JournalSnapshot, TimelineEvent } from "./types.ts";

/**
 * A human-readable, vertical view over the same range as the replay lanes.
 * Prefer the derived journal cards because they collapse noisy capture signals
 * into the meaningful blocks a person actually wants to scan. Raw events remain
 * available as a graceful fallback when the journal endpoint is unavailable.
 */
export function TimelineView(props: {
	data: TimelineEvent[];
	journal: JournalSnapshot | null | undefined;
	onOpenInReplay: (ts: number) => void;
}) {
	const { data, journal, onOpenInReplay } = props;
	const journalGroups = useMemo(
		() => groupJournalCards(journal?.cards ?? []),
		[journal?.cards]
	);
	const eventGroups = useMemo(() => groupTimelineEvents(data), [data]);
	const hasJournal = journalGroups.length > 0;
	const totalItems = hasJournal ? (journal?.cards.length ?? 0) : data.length;

	return (
		<div className="min-h-full bg-muted/10" data-testid="timeline-history-view">
			<div className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-4 sm:p-6">
				<div className="flex items-end justify-between gap-3">
					<div>
						<h2 className="font-medium text-lg">History</h2>
						<p className="text-muted-foreground text-sm">
							{hasJournal
								? "Your recent work, grouped into focus blocks."
								: "Your recent captured activity, newest first."}
						</p>
					</div>
					<span className="shrink-0 rounded-full bg-muted px-2.5 py-1 font-mono text-muted-foreground text-xs tabular-nums">
						{totalItems} {hasJournal ? "blocks" : "events"}
					</span>
				</div>

				{hasJournal
					? journalGroups.map((group) => (
							<section className="relative" key={group.key}>
								<TimelineDayHeading
									count={group.items.length}
									label={group.label}
								/>
								<div className="relative space-y-3">
									<div
										aria-hidden="true"
										className="absolute top-5 bottom-5 left-16 w-px bg-border"
									/>
									{group.items.map((card) => (
										<JournalTimelineCard
											card={card}
											key={card.id}
											onOpen={onOpenInReplay}
										/>
									))}
								</div>
							</section>
						))
					: eventGroups.map((group) => (
							<section className="relative" key={group.key}>
								<TimelineDayHeading
									count={group.items.length}
									label={group.label}
								/>
								<div className="relative space-y-3">
									<div
										aria-hidden="true"
										className="absolute top-5 bottom-5 left-16 w-px bg-border"
									/>
									{group.items.map((event, index) => (
										<EventTimelineCard
											event={event}
											key={`${event.ts}-${event.track}-${event.event_type}-${index}`}
											onOpen={onOpenInReplay}
										/>
									))}
								</div>
							</section>
						))}
			</div>
		</div>
	);
}

export function TimelineDayHeading(props: { count: number; label: string }) {
	return (
		<div className="mb-3 flex items-center gap-3">
			<h3 className="font-medium text-muted-foreground text-xs uppercase tracking-wide">
				{props.label}
			</h3>
			<div className="h-px flex-1 bg-border/60" />
			<span className="font-mono text-muted-foreground text-xs tabular-nums">
				{props.count}
			</span>
		</div>
	);
}

export const JournalTimelineCard = memo(function JournalTimelineCard(props: {
	card: JournalCard;
	onOpen: (ts: number) => void;
}) {
	const { card, onOpen } = props;
	const tl = useLiteralMessages();
	const dotClass = card.distraction ? "bg-warning" : "bg-primary";
	return (
		<Button
			aria-label={tl("Open {title} in replay", { title: card.title })}
			className="group h-auto w-full"
			onClick={() => onOpen(card.start_ts)}
			type="button"
			variant="ghost"
		>
			<div className="grid w-full grid-cols-[4rem_minmax(0,1fr)] gap-4 text-left">
				<time
					className="pt-4 text-right font-mono text-muted-foreground text-xs tabular-nums"
					dateTime={new Date(card.start_ts / 1000).toISOString()}
				>
					{formatClock(card.start_ts)}
				</time>
				<div className="relative rounded-xl border bg-card p-4 shadow-sm transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
					<span
						aria-hidden="true"
						className={`absolute top-5 -left-[1.32rem] size-2.5 rounded-full ring-4 ring-background ${dotClass}`}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={`rounded-full px-2 py-0.5 font-medium text-xs ${
								card.distraction
									? "bg-warning/15 text-status-warning"
									: "bg-primary/15 text-primary"
							}`}
						>
							{card.category}
						</span>
						<AppIconStack apps={card.apps ?? []} />
						<span className="text-muted-foreground text-xs">
							{card.primary_app}
						</span>
						<span className="ml-auto text-muted-foreground text-xs">
							{tl("{duration} · {count} events", {
								count: String(card.event_count),
								duration: formatMinutes(card.end_ts - card.start_ts),
							})}
						</span>
					</div>
					<h4 className="mt-2 font-medium text-sm leading-snug">
						{card.title}
					</h4>
					<p className="mt-1 line-clamp-3 text-muted-foreground text-sm leading-5">
						{card.detailed_summary || card.summary}
					</p>
					<div className="mt-3 flex items-center justify-between gap-2 text-muted-foreground text-xs">
						<span>{tl("{time} end", { time: formatClock(card.end_ts) })}</span>
						<span className="text-primary opacity-0 transition-opacity group-hover:opacity-100">
							Open in Replay →
						</span>
					</div>
				</div>
			</div>
		</Button>
	);
});

export const EventTimelineCard = memo(function EventTimelineCard(props: {
	event: TimelineEvent;
	onOpen: (ts: number) => void;
}) {
	const { event, onOpen } = props;
	const tl = useLiteralMessages();
	const meta = trackMeta(event.track);
	return (
		<Button
			aria-label={tl("Open {title} in replay", { title: eventLabel(event) })}
			className="group h-auto w-full"
			onClick={() => onOpen(event.ts)}
			type="button"
			variant="ghost"
		>
			<div className="grid w-full grid-cols-[4rem_minmax(0,1fr)] gap-4 text-left">
				<time
					className="pt-4 text-right font-mono text-muted-foreground text-xs tabular-nums"
					dateTime={new Date(event.ts / 1000).toISOString()}
				>
					{formatClock(event.ts)}
				</time>
				<div className="relative rounded-xl border bg-card p-4 shadow-sm transition-colors group-hover:border-primary/40 group-hover:bg-accent/40">
					<span
						aria-hidden="true"
						className={`absolute top-5 -left-[1.32rem] size-2.5 rounded-full ring-4 ring-background ${meta.bar}`}
					/>
					<div className="flex flex-wrap items-center gap-2">
						<span
							className={`rounded-full px-2 py-0.5 font-medium text-xs ${meta.tint}`}
						>
							{meta.label}
						</span>
						<span className="text-muted-foreground text-xs">
							{event.app_name || "Captured activity"}
						</span>
					</div>
					<h4 className="mt-2 font-medium text-sm leading-snug">
						{eventLabel(event)}
					</h4>
					<p className="mt-1 text-muted-foreground text-xs">
						{formatEventType(event.event_type)}
						{event.url ? ` · ${event.url}` : ""}
					</p>
					<div className="mt-3 text-primary text-xs opacity-0 transition-opacity group-hover:opacity-100">
						Open in Replay →
					</div>
				</div>
			</div>
		</Button>
	);
});
