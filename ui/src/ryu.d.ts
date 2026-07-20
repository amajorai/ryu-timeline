// The `window.ryu` bridge surface this app consumes. The host installs it inline
// (Path B bootstrap) BEFORE this module runs; every method is a capability-gated
// RPC over a MessagePort — no tokens, no direct network (the frame's CSP is
// `connect-src 'none'`). Calls made before the host port arrives are queued and
// flushed on connect. This app needs only the `timeline` surface (grant
// `timeline:read`); the host owns the device-local Shadow reads behind it.
//
// INVARIANT: Shadow is device-local and NEVER node-scoped. The desktop
// `shadow.ts` client hits 127.0.0.1:3030 directly (no node token, no `ApiTarget`),
// so the host closures for these verbs call Shadow WITHOUT `toTarget(node)` — the
// captured screen/input only has meaning relative to the physical machine.
//
// The `list`/`journal` return shapes mirror the desktop client the host reuses
// verbatim (Shadow's snake_case), so `bridge.ts` re-declares the concrete types and
// casts these `unknown`. `frame` returns a `data:` URL (the host performs the
// privileged Shadow fetch and base64-encodes it) because the CSP-locked frame can
// only render `img-src data: blob:`.
//
// MIGRATION (docs/renderer-host-slice-1.md): the Weekly-Review and Settings row/empty
// -state opens previously used BESPOKE `timeline.openReview`/`timeline.openSettings`
// host verbs. They now go through the generic, route-allowlisted `shell.openTab` — the
// same shell privilege a compiled-in panel gets from `useTabsContext().openTab`, now
// reachable from a decoupled companion (grant `shell:integrate`). The app-specific
// `timeline:read` data verbs (`list`/`journal`/`frame`) are unchanged.

export interface RyuTimeline {
	/** Shadow `GET /timeline` for the last `rangeMinutes` — ascending by ts, or
	 *  `null` when Shadow (:3030) is unreachable. */
	list(args: { rangeMinutes: number }): Promise<unknown>;
	/** Shadow `GET /journal` (the derived Dayflow work journal) for the same range;
	 *  `narrate` runs the LLM title/summary polish pass. `null` when unreachable. */
	journal(args: { rangeMinutes: number; narrate?: boolean }): Promise<unknown>;
	/** The nearest keyframe at `tsMicros` as a `data:` URL (host-fetched from Shadow's
	 *  `/frame`, base64-encoded so the CSP-locked frame can render it), or `null`
	 *  when no frame exists near that moment (capture off/paused/none recorded). */
	frame(args: { tsMicros: number }): Promise<string | null>;
}

/** A disposable handle a streaming shell subscription returns. `dispose()` releases
 *  the subscription early; it is also torn down automatically on frame unmount. */
export interface RyuShellSubscription {
	dispose(): void;
}

/** The generic shell-primitive lane (grant `shell:integrate`). Only the subset this
 *  app uses is declared; the full surface is in `docs/renderer-host-slice-1.md`. */
export interface RyuShell {
	/** Open a shell tab at an ALLOWLISTED route, forwarding `openTab` options. The
	 *  host rejects any non-allowlisted destination (anti-phishing). */
	openTab(args: {
		path: string;
		title?: string;
		conversationId?: string;
		forceNew?: boolean;
		initialPrompt?: string;
	}): Promise<void>;
	/** Subscribe to the host's LIVE resolved theme tokens: `onChange` fires with the
	 *  current token map now and on every host theme change. */
	subscribeTheme(opts: {
		onChange: (tokens: Record<string, string>) => void;
	}): RyuShellSubscription;
}

export interface RyuBridge {
	context: { spaceId?: string; docId?: string; focusTs?: number } | null;
	timeline: RyuTimeline;
	shell: RyuShell;
}

declare global {
	interface Window {
		ryu?: RyuBridge;
	}
}
