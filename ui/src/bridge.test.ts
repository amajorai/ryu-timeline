// Co-located unit tests for the `window.ryu` bridge client. bridge.ts has only
// type-only imports (erased by bun), so it runs without pulling React or @ryu/ui.
// We drive it by installing a fake `globalThis.window` (and, for the theme path, a
// fake `document`) and asserting the real branching: the finite-number gate in
// `focusContextTs`, the `--`-prefixed-string token filter in `subscribeLiveTheme`,
// the synchronous `ryu()` throw when the bridge is absent, and arg forwarding.

import { afterEach, describe, expect, it } from "bun:test";
import {
	focusContextTs,
	getFrameDataUrl,
	getJournal,
	getTimeline,
	openReview,
	openSettings,
	subscribeLiveTheme,
} from "./bridge.ts";

type OpenTabArgs = {
	path: string;
	title?: string;
};

interface BridgeCalls {
	list: Array<{ rangeMinutes: number }>;
	journal: Array<{ rangeMinutes: number; narrate?: boolean }>;
	frame: Array<{ tsMicros: number }>;
	openTab: OpenTabArgs[];
	disposed: number;
}

function installBridge(opts?: {
	focusTs?: unknown;
	context?: unknown;
	listResult?: unknown;
	journalResult?: unknown;
	frameResult?: string | null;
	openTabRejects?: boolean;
	omitShell?: boolean;
	omitSubscribeTheme?: boolean;
	subscribeThemeTokens?: Record<string, unknown>;
}): BridgeCalls {
	const calls: BridgeCalls = {
		list: [],
		journal: [],
		frame: [],
		openTab: [],
		disposed: 0,
	};
	const shell = {
		openTab: (args: OpenTabArgs) => {
			calls.openTab.push(args);
			return opts?.openTabRejects
				? Promise.reject(new Error("denied"))
				: Promise.resolve();
		},
		subscribeTheme: (o: { onChange: (t: Record<string, unknown>) => void }) => {
			// Fire the token map synchronously, mirroring the host's "emit current now".
			o.onChange(opts?.subscribeThemeTokens ?? {});
			return { dispose: () => calls.disposed++ };
		},
	} as Record<string, unknown>;
	if (opts?.omitSubscribeTheme) {
		delete shell.subscribeTheme;
	}
	const context =
		opts && "context" in opts
			? opts.context
			: { focusTs: opts?.focusTs };
	const bridge: Record<string, unknown> = {
		context,
		timeline: {
			list: (args: { rangeMinutes: number }) => {
				calls.list.push(args);
				return Promise.resolve(
					opts && "listResult" in opts ? opts.listResult : []
				);
			},
			journal: (args: { rangeMinutes: number; narrate?: boolean }) => {
				calls.journal.push(args);
				return Promise.resolve(opts?.journalResult ?? null);
			},
			frame: (args: { tsMicros: number }) => {
				calls.frame.push(args);
				return Promise.resolve(opts?.frameResult ?? null);
			},
		},
	};
	if (!opts?.omitShell) {
		bridge.shell = shell;
	}
	(globalThis as { window?: unknown }).window = { ryu: bridge };
	return calls;
}

afterEach(() => {
	(globalThis as { window?: unknown }).window = undefined;
	(globalThis as { document?: unknown }).document = undefined;
});

describe("focusContextTs", () => {
	it("returns null when there is no window at all", () => {
		(globalThis as { window?: unknown }).window = undefined;
		expect(focusContextTs()).toBeNull();
	});

	it("returns a finite focus timestamp verbatim", () => {
		installBridge({ focusTs: 1_700_000_000_000_000 });
		expect(focusContextTs()).toBe(1_700_000_000_000_000);
	});

	it("passes through a finite value of zero", () => {
		installBridge({ focusTs: 0 });
		expect(focusContextTs()).toBe(0);
	});

	it("rejects NaN", () => {
		installBridge({ focusTs: Number.NaN });
		expect(focusContextTs()).toBeNull();
	});

	it("rejects Infinity", () => {
		installBridge({ focusTs: Number.POSITIVE_INFINITY });
		expect(focusContextTs()).toBeNull();
	});

	it("rejects a non-number value", () => {
		installBridge({ focusTs: "1700000000000000" });
		expect(focusContextTs()).toBeNull();
	});

	it("returns null when context is missing entirely", () => {
		installBridge({ context: null });
		expect(focusContextTs()).toBeNull();
	});
});

describe("ryu() guard", () => {
	it("getTimeline throws synchronously when the bridge is absent", () => {
		(globalThis as { window?: unknown }).window = {}; // window exists, ryu does not
		expect(() => getTimeline(60)).toThrow(/timeline capability is not available/);
	});
});

describe("data verb forwarding", () => {
	it("getTimeline forwards rangeMinutes and returns the list result", async () => {
		const rows = [{ ts: 1 }, { ts: 2 }];
		const calls = installBridge({ listResult: rows });
		const result = await getTimeline(360);
		expect(calls.list).toEqual([{ rangeMinutes: 360 }]);
		expect(result).toBe(rows as never);
	});

	it("getTimeline propagates a null (Shadow-unreachable) result", async () => {
		installBridge({ listResult: null });
		expect(await getTimeline(15)).toBeNull();
	});

	it("getJournal forwards BOTH rangeMinutes and narrate", async () => {
		const calls = installBridge({ journalResult: null });
		await getJournal(1440, true);
		expect(calls.journal).toEqual([{ rangeMinutes: 1440, narrate: true }]);
	});

	it("getFrameDataUrl forwards tsMicros and returns the data URL", async () => {
		const calls = installBridge({ frameResult: "data:image/png;base64,AAA" });
		const url = await getFrameDataUrl(42);
		expect(calls.frame).toEqual([{ tsMicros: 42 }]);
		expect(url).toBe("data:image/png;base64,AAA");
	});
});

describe("shell navigation verbs", () => {
	it("openReview opens the allowlisted /review tab", () => {
		const calls = installBridge();
		openReview();
		expect(calls.openTab).toEqual([{ path: "/review", title: "Weekly review" }]);
	});

	it("openSettings opens the /settings tab", () => {
		const calls = installBridge();
		openSettings();
		expect(calls.openTab).toEqual([{ path: "/settings" }]);
	});

	it("openReview swallows a rejected openTab without throwing", async () => {
		installBridge({ openTabRejects: true });
		expect(() => openReview()).not.toThrow();
		// Let the internal .catch settle; an unswallowed rejection would surface here.
		await Promise.resolve();
	});
});

describe("subscribeLiveTheme", () => {
	function installFakeDocument(): Array<[string, string]> {
		const captured: Array<[string, string]> = [];
		(globalThis as { document?: unknown }).document = {
			documentElement: {
				style: {
					setProperty: (name: string, value: string) => {
						captured.push([name, value]);
					},
				},
			},
		};
		return captured;
	}

	it("applies only --prefixed string tokens and returns a working disposer", () => {
		const captured = installFakeDocument();
		const calls = installBridge({
			subscribeThemeTokens: {
				"--background": "#000",
				"--foreground": "#fff",
				color: "red", // no -- prefix: ignored
				"--radius": 8, // not a string: ignored
			},
		});
		const dispose = subscribeLiveTheme();
		expect(captured).toEqual([
			["--background", "#000"],
			["--foreground", "#fff"],
		]);
		expect(calls.disposed).toBe(0);
		dispose();
		expect(calls.disposed).toBe(1);
	});

	it("is a no-op disposer when the shell surface is absent", () => {
		installBridge({ omitShell: true });
		const dispose = subscribeLiveTheme();
		expect(() => dispose()).not.toThrow();
	});

	it("is a no-op when subscribeTheme is not provided", () => {
		installBridge({ omitSubscribeTheme: true });
		expect(() => subscribeLiveTheme()()).not.toThrow();
	});
});
