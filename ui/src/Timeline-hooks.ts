import { type RefObject, useEffect, useState } from "react";
import { getFrameDataUrl } from "./bridge.ts";

/** Debounce a fast-changing value so downstream effects (e.g. image loads) coalesce. */
export function useDebounced<T>(value: T, ms: number): T {
	const [debounced, setDebounced] = useState(value);
	useEffect(() => {
		const id = setTimeout(() => setDebounced(value), ms);
		return () => clearTimeout(id);
	}, [value, ms]);
	return debounced;
}

/**
 * Resolve the keyframe at `tsMicros` to a `data:` URL via the host bridge (the
 * frame cannot fetch Shadow's `/frame` itself under `img-src data: blob:`). Resets
 * to `null` while a new bucket loads and on failure, so the caller renders its
 * placeholder — parity with the desktop `<img onError>` fallback.
 */
export function useFrameDataUrl(tsMicros: number): string | null {
	const [src, setSrc] = useState<string | null>(null);
	useEffect(() => {
		let alive = true;
		setSrc(null);
		getFrameDataUrl(tsMicros)
			.then((url) => {
				if (alive) {
					setSrc(url);
				}
			})
			.catch(() => {
				if (alive) {
					setSrc(null);
				}
			});
		return () => {
			alive = false;
		};
	}, [tsMicros]);
	return src;
}

/** Measure an element's content width with a ResizeObserver. */
export function useElementWidth(ref: RefObject<HTMLElement | null>): number {
	const [width, setWidth] = useState(0);
	useEffect(() => {
		const el = ref.current;
		if (!el) {
			return;
		}
		setWidth(el.clientWidth);
		const ro = new ResizeObserver((entries) => {
			for (const entry of entries) {
				setWidth(entry.contentRect.width);
			}
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [ref]);
	return width;
}
