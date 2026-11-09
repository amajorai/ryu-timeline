import { describe, expect, test } from "bun:test";
import { formatMessage, type MessageValuesInput } from "@ryu/i18n/core";
// The provider registers its runtime here; a test registers a stand-in.
import {
	registerActiveI18nRuntime,
	unregisterActiveI18nRuntime,
} from "../../../../packages/i18n/src/active-locale.ts";
import { eventTypeLabel } from "./event-type-labels.ts";

// Stand-in rows for the catalog rows the extractor adds for the labels.
const CATALOGS: Record<string, Record<string, string>> = {
	ja: {
		Activity: "アクティビティ",
		"App switch": "アプリの切り替え",
		Focus: "集中",
		"Focus change": "フォーカスの変更",
		"Journal marker": "ジャーナルマーカー",
		"Key down": "キー押下",
		"Mouse down": "マウス押下",
	},
};

function runtimeFor(locale: string) {
	return {
		direction: "ltr" as const,
		locale,
		translate(_id: string, values?: MessageValuesInput, fallback = "") {
			return formatMessage(
				CATALOGS[locale]?.[fallback] ?? fallback,
				values,
				locale
			);
		},
	};
}

function inLocale<T>(locale: string, read: () => T): T {
	const runtime = runtimeFor(locale);
	registerActiveI18nRuntime(runtime);
	try {
		return read();
	} finally {
		unregisterActiveI18nRuntime(runtime);
	}
}

describe("eventTypeLabel", () => {
	test("reads every known wire type as an English phrase", () => {
		expect(eventTypeLabel("app_switch")).toBe("App switch");
		expect(eventTypeLabel("key_down")).toBe("Key down");
		expect(eventTypeLabel("mouse_down")).toBe("Mouse down");
		expect(eventTypeLabel("journal_marker")).toBe("Journal marker");
		expect(eventTypeLabel("clipboard_change")).toBe("Clipboard change");
		expect(eventTypeLabel("scroll")).toBe("Scroll");
		expect(eventTypeLabel("click")).toBe("Click");
		expect(eventTypeLabel("focus")).toBe("Focus change");
	});

	test("reads known types in the reader's language", () => {
		const labels = inLocale("ja", () =>
			[
				"app_switch",
				"key_down",
				"mouse_down",
				"journal_marker",
				"focus",
				"",
			].map(eventTypeLabel)
		);
		expect(labels).toEqual([
			"アプリの切り替え",
			"キー押下",
			"マウス押下",
			"ジャーナルマーカー",
			"フォーカスの変更",
			"アクティビティ",
		]);
	});

	test("keeps the capitalised fallback for types without a label", () => {
		expect(eventTypeLabel("git_activity")).toBe("Git activity");
		expect(eventTypeLabel("window-title")).toBe("Window title");
		expect(eventTypeLabel("constructor")).toBe("Constructor");
		expect(eventTypeLabel("")).toBe("Activity");
	});
});
