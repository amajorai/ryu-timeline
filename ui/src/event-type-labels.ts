import { translate as tl } from "@ryu/i18n/core";

/**
 * Whole-message labels for the wire event types Shadow captures. Each label is
 * one literal `tl()` key so the extractor and translators see a full phrase;
 * building the label from the wire name would leave it in English.
 */
const EVENT_TYPE_LABEL: Readonly<Record<string, () => string>> = {
	app_switch: () => tl("App switch"),
	click: () => tl("Click"),
	clipboard_change: () => tl("Clipboard change"),
	// Not the bare "Focus" key: that one is the Focus summary (concentration).
	focus: () => tl("Focus change"),
	journal_marker: () => tl("Journal marker"),
	key_down: () => tl("Key down"),
	mouse_down: () => tl("Mouse down"),
	scroll: () => tl("Scroll"),
};

/** The reader-language label for a captured event type such as `app_switch`. */
export function eventTypeLabel(eventType: string): string {
	const known = Object.hasOwn(EVENT_TYPE_LABEL, eventType)
		? EVENT_TYPE_LABEL[eventType]
		: undefined;
	if (known) {
		return known();
	}
	// Types Shadow adds later still read as words until they get a label.
	const words = eventType.replace(/[_-]+/g, " ").trim();
	if (!words) {
		return tl("Activity");
	}
	return words.charAt(0).toUpperCase() + words.slice(1);
}
