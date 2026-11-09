import { describe, expect, it } from "bun:test";
import { I18nProvider } from "@ryu/i18n/react";
import { renderToStaticMarkup } from "react-dom/server";
import { TrackLane } from "./Timeline-lanes.tsx";

function lane(locale: string) {
	return renderToStaticMarkup(
		<I18nProvider
			autoLocalizeDom={false}
			initialLocale={locale}
			manageDocument={false}
		>
			<TrackLane
				events={[]}
				labelW={120}
				laneWidth={600}
				onScrubStart={() => undefined}
				onSeek={() => undefined}
				pxPerMicro={0.001}
				start={0}
				track={0}
				visLeftPx={0}
				visRightPx={600}
			/>
		</I18nProvider>
	);
}

describe("TrackLane direction", () => {
	it("puts the locale's direction back on the sticky lane label", () => {
		expect(lane("ar")).toContain('dir="rtl"');
		expect(lane("en")).toContain('dir="ltr"');
	});
});
