// Exercises shared boundary validation, the finite focus timestamp gate,
// live theme token filtering, synchronous bridge guards, and argument forwarding.

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
import type { RyuTimeline } from "./ryu.d.ts";
import type { JournalSnapshot, TimelineEvent } from "./types.ts";

interface OpenTabArgs {
	path: string;
	title?: string;
}

interface BridgeCalls {
	disposed: number;
	frame: Array<{ tsMicros: number }>;
	journal: Array<{ rangeMinutes: number; narrate?: boolean }>;
	list: Array<{ rangeMinutes: number }>;
	openTab: OpenTabArgs[];
}

interface TimelineShellFixture {
	openTab(args: OpenTabArgs): Promise<void>;
	subscribeTheme?: (opts: {
		onChange: (tokens: Record<string, string | number>) => void;
	}) => { dispose(): void };
}
interface TimelineBridgeFixture {
	context: { focusTs?: number | string } | null | undefined;
	shell?: TimelineShellFixture;
	timeline: RyuTimeline;
}
const previousWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const previousDocument = Object.getOwnPropertyDescriptor(
	globalThis,
	"document"
);
function installWindow(
	value: { ryu?: TimelineBridgeFixture } | undefined
): void {
	Object.defineProperty(globalThis, "window", {
		configurable: true,
		writable: true,
		value,
	});
}
function restoreGlobal(
	name: "window" | "document",
	descriptor: PropertyDescriptor | undefined
): void {
	if (descriptor) {
		Object.defineProperty(globalThis, name, descriptor);
	} else {
		Reflect.deleteProperty(globalThis, name);
	}
}

function installBridge(opts?: {
	focusTs?: number | string;
	context?: { focusTs?: number | string } | null;
	listResult?: TimelineEvent[] | null;
	journalResult?: JournalSnapshot | null;
	frameResult?: string | null;
	openTabRejects?: boolean;
	omitShell?: boolean;
	omitSubscribeTheme?: boolean;
	subscribeThemeTokens?: Record<string, string | number>;
}): BridgeCalls {
	const calls: BridgeCalls = {
		list: [],
		journal: [],
		frame: [],
		openTab: [],
		disposed: 0,
	};
	const shell: TimelineShellFixture = {
		openTab: (args: OpenTabArgs) => {
			calls.openTab.push(args);
			return opts?.openTabRejects
				? Promise.reject(new Error("denied"))
				: Promise.resolve();
		},
		subscribeTheme: (o: {
			onChange: (t: Record<string, string | number>) => void;
		}) => {
			// Fire the token map synchronously, mirroring the host's "emit current now".
			o.onChange(opts?.subscribeThemeTokens ?? {});
			return { dispose: () => calls.disposed++ };
		},
	};
	if (opts?.omitSubscribeTheme) {
		shell.subscribeTheme = undefined;
	}
	const context =
		opts && "context" in opts ? opts.context : { focusTs: opts?.focusTs };
	const bridge: TimelineBridgeFixture = {
		context,
		timeline: {
			list: (args: { rangeMinutes: number }) => {
				calls.list.push(args);
				return Promise.resolve(
					opts && "listResult" in opts ? (opts.listResult ?? null) : []
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
	installWindow({ ryu: bridge });
	return calls;
}

afterEach(() => {
	restoreGlobal("window", previousWindow);
	restoreGlobal("document", previousDocument);
});

describe("focusContextTs", () => {
	it("returns null when there is no window at all", () => {
		installWindow(undefined);
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
		installWindow({}); // window exists, ryu does not
		expect(() => getTimeline(60)).toThrow(
			/timeline capability is not available/
		);
	});
});

describe("data verb forwarding", () => {
	it("getTimeline forwards rangeMinutes and returns the list result", async () => {
		const rows: TimelineEvent[] = [1, 2].map((ts) => ({
			app_name: null,
			event_type: "capture",
			track: 1,
			ts,
			url: null,
			window_title: null,
		}));
		const calls = installBridge({ listResult: rows });
		const result = await getTimeline(360);
		expect(calls.list).toEqual([{ rangeMinutes: 360 }]);
		expect(result).toBe(rows);
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
		expect(calls.openTab).toEqual([
			{ path: "/review", title: "Weekly review" },
		]);
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
	function installFakeDocument(): [string, string][] {
		const captured: [string, string][] = [];
		Object.defineProperty(globalThis, "document", {
			configurable: true,
			writable: true,
			value: {
				documentElement: {
					style: {
						setProperty: (name: string, value: string) => {
							captured.push([name, value]);
						},
					},
				},
			},
		});
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
