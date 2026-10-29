import type { CSSProperties } from "react";

declare module "react" {
	interface CSSProperties {
		"--timeline-icon-layer"?: number;
		"--timeline-label-width"?: string;
		"--timeline-lane-width"?: string;
		"--timeline-left"?: string;
		"--timeline-playhead-offset"?: string;
		"--timeline-preview-height"?: string;
		"--timeline-width"?: string;
	}
}

export type TimelineStyle = CSSProperties;
