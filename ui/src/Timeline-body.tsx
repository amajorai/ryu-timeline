import { Activity01Icon, Files01Icon } from "@hugeicons/core-free-icons";
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
import { Spinner } from "@ryu/ui/components/spinner.tsx";
import type { TimelineEvent } from "./types.ts";

/** The loading / error / empty bodies. Returns `null` to fall through to the scrubber. */
export function renderBody(props: {
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
