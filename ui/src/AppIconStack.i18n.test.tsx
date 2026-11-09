import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppIconStack } from "./AppIconStack.tsx";
import type { JournalApp } from "./types.ts";

const MORE_APPS = "{overflow, plural, one {# more app} other {# more apps}}";

// Stub rows standing in for the catalog rows the coordinator generates.
const AR = {
	[MORE_APPS]:
		"{overflow, plural, zero {لا تطبيقات أخرى} one {تطبيق آخر} two {تطبيقان آخران} few {# تطبيقات أخرى} many {# تطبيقًا آخر} other {# تطبيق آخر}}",
};
const DE = {
	[MORE_APPS]: "{overflow, plural, one {# weitere App} other {# weitere Apps}}",
};

function appsWithOverflow(overflow: number): JournalApp[] {
	return Array.from({ length: 1 + overflow }, (_, index) => ({
		icon_url: null,
		name: `App ${index}`,
	}));
}

function overflowLabel(locale: string, overflow: number): string | undefined {
	const html = renderToStaticMarkup(
		<I18nProvider
			initialLocale={locale}
			manageDocument={false}
			overlays={{ ar: AR, de: DE }}
		>
			<AppIconStack apps={appsWithOverflow(overflow)} maxVisible={1} />
		</I18nProvider>
	);
	const match = html.match(
		/aria-label="([^"]*)"[^>]*data-slot="timeline-app-icon-overflow"/
	);
	return match?.[1];
}

describe("AppIconStack overflow count", () => {
	it("pluralizes the English label", () => {
		expect(overflowLabel("en", 1)).toBe("1 more app");
		expect(overflowLabel("en", 2)).toBe("2 more apps");
	});

	it("selects distinct Arabic forms for 1, 2 and 11", () => {
		expect(overflowLabel("ar", 1)).toBe("تطبيق آخر");
		expect(overflowLabel("ar", 2)).toBe("تطبيقان آخران");
		expect(overflowLabel("ar", 11)).toBe("11 تطبيقًا آخر");
	});

	it("selects the German singular and plural forms", () => {
		expect(overflowLabel("de", 1)).toBe("1 weitere App");
		expect(overflowLabel("de", 3)).toBe("3 weitere Apps");
	});
});
