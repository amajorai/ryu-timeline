import { describe, expect, it } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
	AppIconStack,
	appInitial,
	visibleTimelineApps,
} from "./AppIconStack.tsx";
import type { JournalApp } from "./types.ts";

const apps: JournalApp[] = [
	{
		icon_url: "data:image/png;base64,whatsapp",
		name: "WhatsApp",
	},
	{ icon_url: null, name: "Chrome" },
	{ icon_url: "data:image/png;base64,slack", name: "Slack" },
];

describe("AppIconStack", () => {
	it("keeps first-seen order, renders initials, and exposes all app names", () => {
		const html = renderToStaticMarkup(<AppIconStack apps={apps} />);

		expect(html).toContain("Apps involved: WhatsApp, Chrome, Slack");
		expect(html).toContain('alt="WhatsApp app icon"');
		expect(html).toContain('aria-label="Chrome app icon"');
		expect(html).toContain(">C</span>");
		expect(html).toContain('alt="Slack app icon"');
	});

	it("shows a bounded stack and overflow count", () => {
		const html = renderToStaticMarkup(
			<AppIconStack apps={apps} maxVisible={2} />
		);

		expect(visibleTimelineApps(apps, 2)).toHaveLength(2);
		expect(html).toContain('aria-label="1 more apps"');
		expect(html).toContain(">+1</span>");
	});

	it("returns a readable initial for empty and Unicode names", () => {
		expect(appInitial("  WhatsApp")).toBe("W");
		expect(appInitial("📝 Notes")).toBe("📝");
		expect(appInitial(" ")).toBe("?");
	});
});
