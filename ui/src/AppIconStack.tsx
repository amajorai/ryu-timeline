import { useState } from "react";
import type { JournalApp } from "./types.ts";

const DEFAULT_MAX_VISIBLE = 3;

export function appInitial(name: string): string {
	const first = Array.from(name.trim())[0];
	return first?.toUpperCase() ?? "?";
}

export function visibleTimelineApps(
	apps: readonly JournalApp[],
	maxVisible = DEFAULT_MAX_VISIBLE
): readonly JournalApp[] {
	return apps.slice(0, Math.max(1, maxVisible));
}

export function AppIconStack(props: {
	apps: readonly JournalApp[];
	className?: string;
	maxVisible?: number;
}) {
	const { apps, className, maxVisible = DEFAULT_MAX_VISIBLE } = props;
	const [failedKeys, setFailedKeys] = useState<ReadonlySet<string>>(
		() => new Set()
	);
	if (apps.length === 0) {
		return null;
	}

	const visible = visibleTimelineApps(apps, maxVisible);
	const overflow = Math.max(0, apps.length - visible.length);
	const appNames = apps.map((app) => app.name).join(", ");

	return (
		<div
			aria-label={`Apps involved: ${appNames}`}
			className={`inline-flex shrink-0 items-center ${className ?? ""}`}
			data-slot="timeline-app-icon-stack"
			role="list"
		>
			{visible.map((app, index) => {
				const key = `${app.name}-${index}`;
				const hasImage = Boolean(app.icon_url) && !failedKeys.has(key);
				return (
					<span
						aria-label={`${app.name} app icon`}
						className="relative -ml-1.5 inline-flex size-5 shrink-0 items-center justify-center overflow-hidden rounded-md border-2 border-background bg-muted text-[9px] text-muted-foreground first:ml-0"
						data-slot="timeline-app-icon"
						key={key}
						role="listitem"
						style={{ zIndex: visible.length - index }}
						title={app.name}
					>
						{hasImage ? (
							<img
								alt={`${app.name} app icon`}
								className="size-full object-cover"
								draggable={false}
								onError={() => {
									setFailedKeys((current) => {
										const next = new Set(current);
										next.add(key);
										return next;
									});
								}}
								src={app.icon_url ?? undefined}
							/>
						) : (
							<span aria-hidden="true">{appInitial(app.name)}</span>
						)}
					</span>
				);
			})}
			{overflow > 0 ? (
				<span
					aria-label={`${overflow} more apps`}
					className="relative -ml-1.5 inline-flex size-5 shrink-0 items-center justify-center rounded-md border-2 border-background bg-muted font-mono text-[8px] text-muted-foreground tabular-nums"
					data-slot="timeline-app-icon-overflow"
					role="listitem"
					title={`${overflow} more apps`}
				>
					+{overflow}
				</span>
			) : null}
		</div>
	);
}
