import { ArrowRight01Icon, SparklesIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useLiteralMessages } from "@ryu/i18n/react";
import { Button } from "@ryu/ui/components/button.tsx";
import { memo } from "react";
import { AppIconStack } from "./AppIconStack.tsx";
import { FocusSummary } from "./FocusSummary.tsx";
import { formatMinutes } from "./Timeline-model.ts";
import type { JournalCard, JournalSnapshot } from "./types.ts";

/** Dayflow-inspired work journal: derived cards + standup draft from Shadow. */
export const JournalPane = memo(function JournalPane(props: {
	isError: boolean;
	isFetching: boolean;
	journal: JournalSnapshot | null | undefined;
	narrate: boolean;
	onOpenReview: () => void;
	onRetry: () => void;
	onSeek: (ts: number) => void;
	onToggleNarrate: () => void;
}) {
	const {
		isError,
		isFetching,
		journal,
		narrate,
		onOpenReview,
		onRetry,
		onSeek,
		onToggleNarrate,
	} = props;
	const tl = useLiteralMessages();
	if (!journal || journal.cards.length === 0) {
		return isError ? (
			<div
				className="flex shrink-0 items-center justify-between gap-3 border-destructive/30 border-b bg-destructive/5 px-4 py-3 text-sm"
				role="alert"
			>
				<span>
					Couldn’t refresh the work journal. Existing cards are unchanged.
				</span>
				<Button
					disabled={isFetching}
					onClick={onRetry}
					size="sm"
					variant="outline"
				>
					{isFetching ? "Retrying…" : "Retry journal"}
				</Button>
			</div>
		) : null;
	}

	return (
		<div className="grid shrink-0 gap-3 border-b bg-background px-4 py-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(340px,0.8fr)]">
			<div className="min-w-0">
				{isError ? (
					<div
						className="mb-2 flex items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm"
						role="alert"
					>
						<span>
							Couldn’t refresh the work journal. Existing cards are unchanged.
						</span>
						<Button
							disabled={isFetching}
							onClick={onRetry}
							size="sm"
							variant="outline"
						>
							{isFetching ? "Retrying…" : "Retry journal"}
						</Button>
					</div>
				) : null}
				<div className="mb-2 flex items-center justify-between gap-2">
					<div className="font-medium text-sm">Work journal</div>
					<div className="flex items-center gap-2">
						<span className="text-muted-foreground text-xs">
							{tl("{count} cards", { count: String(journal.cards.length) })}
						</span>
						<Button
							disabled={isFetching}
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

export const JournalCardButton = memo(function JournalCardButton(props: {
	card: JournalCard;
	onSeek: (ts: number) => void;
}) {
	const { card, onSeek } = props;
	return (
		<Button
			className="group h-24 w-64 shrink-0"
			onClick={() => onSeek(card.start_ts)}
			type="button"
			variant="outline"
		>
			<div className="flex h-full w-full flex-col py-3 text-left">
				<div className="mb-1 flex items-center gap-2">
					<span
						className={`size-2 shrink-0 rounded-full ${
							card.distraction ? "bg-warning" : "bg-primary"
						}`}
					/>
					<span className="truncate font-medium text-xs" title={card.category}>
						{card.category}
					</span>
					<AppIconStack apps={card.apps ?? []} />
					<span className="ml-auto shrink-0 text-muted-foreground text-xs">
						{formatMinutes(card.end_ts - card.start_ts)}
					</span>
				</div>
				<div className="line-clamp-2 font-medium text-sm leading-snug">
					{card.title}
				</div>
				<div
					className="mt-auto truncate text-muted-foreground text-xs"
					title={card.summary}
				>
					{card.summary}
				</div>
			</div>
		</Button>
	);
});

export function StandupColumn(props: { items: string[]; title: string }) {
	const { items, title } = props;
	return (
		<div className="min-w-0 rounded-lg bg-muted/30 p-3">
			<div className="mb-2 font-medium text-xs">{title}</div>
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

export function StatList(props: {
	stats: JournalSnapshot["apps"];
	title: string;
}) {
	const { stats, title } = props;
	return (
		<div className="min-w-0 rounded-lg bg-muted/30 p-3">
			<div className="mb-1.5 font-medium text-xs">{title}</div>
			<div className="space-y-1">
				{stats.slice(0, 3).map((stat) => (
					<div className="flex items-center gap-2 text-xs" key={stat.name}>
						<span className="truncate text-muted-foreground" title={stat.name}>
							{stat.name}
						</span>
						<span className="ml-auto shrink-0 font-mono tabular-nums">
							{stat.minutes}m
						</span>
					</div>
				))}
			</div>
		</div>
	);
}
