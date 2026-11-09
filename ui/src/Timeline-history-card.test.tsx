import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventTimelineCard } from "./Timeline-history-view.tsx";
import type { TimelineEvent } from "./types.ts";

function card(event: Partial<TimelineEvent>, locale = "en") {
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			manageDocument={false}
		>
			<EventTimelineCard
				event={{
					app_name: null,
					event_type: "app_switch",
					track: 3,
					ts: 1_700_000_000_000_000,
					url: null,
					window_title: "Inbox",
					...event,
				}}
				onOpen={() => undefined}
			/>
		</I18nProvider>
	);
}

describe("EventTimelineCard meta line", () => {
	it("reads the type label alone when the event has no URL", () => {
		expect(card({})).toContain(">App switch</p>");
	});

	it("isolates the type and keeps the URL left-to-right, as text, under ar", () => {
		const html = card({ url: "https://example.com/a?b=<c>" }, "ar");
		expect(html).toContain(
			'\u2068App switch\u2069 · <bdi dir="ltr">https://example.com/a?b=&lt;c&gt;</bdi>'
		);
	});
});
