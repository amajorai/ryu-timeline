// The client layer the ported page calls. It mirrors the desktop
// `lib/api/shadow.ts` surface the Timeline page used — SAME function names
// (`getTimeline`/`getJournal`), SAME return types — but the call goes over the
// `window.ryu.timeline` bridge instead of a direct `fetch` to 127.0.0.1:3030 (the
// sandboxed frame's CSP is `connect-src 'none'`; the host holds the device-local
// Shadow reach). Return shapes match the desktop client verbatim because the host
// closure reuses that very client (`getTimeline`/`getJournal`/`frameUrl`).
//
// `frameUrl` (a synchronous `<img src>` URL on the desktop) becomes the async
// `getFrameDataUrl` here: the frame cannot fetch Shadow's `/frame` itself
// (`img-src data: blob:` only), so the host performs the fetch and returns a
// `data:` URL. `openReview`/`openSettings` are shell-navigation verbs.

import type { RyuBridge } from "./ryu.d.ts";
import type { JournalSnapshot, TimelineEvent } from "./types.ts";

function ryu(): RyuBridge {
	const b = typeof window === "undefined" ? undefined : window.ryu;
	if (!b) {
		throw new Error(
			"The timeline capability is not available for this app (grant timeline:read)."
		);
	}
	return b;
}

/** The one-shot focus timestamp (Unix µs) a deep-link baked into the mount context
 *  (the desktop page received this via the `ryu:timeline-focus` window event, which
 *  cannot cross the sandbox — it arrives as `window.ryu.context.focusTs` instead). */
export function focusContextTs(): number | null {
	const ts =
		typeof window === "undefined" ? undefined : window.ryu?.context?.focusTs;
	return typeof ts === "number" && Number.isFinite(ts) ? ts : null;
}

/** Shadow `GET /timeline` for the last `rangeMinutes` — ascending by ts, or `null`
 *  when Shadow is unreachable (callers degrade gracefully, exactly as the desktop
 *  page did). */
export function getTimeline(
	rangeMinutes: number
): Promise<TimelineEvent[] | null> {
	return ryu().timeline.list({ rangeMinutes }) as Promise<
		TimelineEvent[] | null
	>;
}

/** Shadow `GET /journal` (derived Dayflow work journal) for the same range; `null`
 *  when Shadow is unreachable. `narrate` runs the LLM polish pass. */
export function getJournal(
	rangeMinutes: number,
	narrate: boolean
): Promise<JournalSnapshot | null> {
	return ryu().timeline.journal({
		rangeMinutes,
		narrate,
	}) as Promise<JournalSnapshot | null>;
}

/** The nearest keyframe at `tsMicros` as a `data:` URL (host-fetched from Shadow's
 *  `/frame`), or `null` when none exists near that moment. Replaces the desktop
 *  page's synchronous `frameUrl` `<img src>`. */
export function getFrameDataUrl(tsMicros: number): Promise<string | null> {
	return ryu().timeline.frame({ tsMicros });
}

/** Open the Weekly Review tab (the desktop page's `navigate("/review")`), routed
 *  through the GENERIC, route-allowlisted `shell.openTab` primitive (was the bespoke
 *  `timeline.openReview` verb; docs/renderer-host-slice-1.md). Behavior-identical:
 *  the host opens `/review` with the same "Weekly review" title, respecting single-tab
 *  reuse. */
export function openReview(): void {
	// Fire-and-forget: the sandboxed frame does not await navigation. A denial
	// (e.g. missing `shell:integrate` grant) rejects the promise; swallow it so a
	// click can never surface an unhandled rejection.
	ryu()
		.shell.openTab({ path: "/review", title: "Weekly review" })
		.catch(() => undefined);
}

/** Open Settings (the desktop page's `navigate("/settings")` from the recording-off
 *  empty state), routed through the GENERIC, route-allowlisted `shell.openTab`
 *  primitive (was the bespoke `timeline.openSettings` verb). Behavior-identical. */
export function openSettings(): void {
	ryu()
		.shell.openTab({ path: "/settings" })
		.catch(() => undefined);
}

export { subscribeCompanionTheme as subscribeLiveTheme } from "@ryu/app-host/companion-theme";
