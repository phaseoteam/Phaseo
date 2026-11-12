// Fixed notice bars stacked above the site header. Each bar reports its own
// measured height; the total feeds `--site-notice-height`, which the header,
// chat root, settings sidebar and sticky page chrome already offset by.
export const NOTICE_STACK_SOURCES = ["site", "deprecation"] as const;
export type NoticeStackSource = (typeof NOTICE_STACK_SOURCES)[number];

export type NoticeStackVariables = Record<string, string>;

/** CSS variables for a stack: the total, plus each bar's own height and top. */
export function noticeStackVariables(heights: Partial<Record<NoticeStackSource, number>>): NoticeStackVariables {
	const variables: NoticeStackVariables = {};
	let top = 0;
	for (const source of NOTICE_STACK_SOURCES) {
		const height = Math.max(0, heights[source] ?? 0);
		variables[`--${source}-notice-top`] = `${top}px`;
		variables[`--${source}-notice-bar-height`] = `${height}px`;
		top += height;
	}
	variables["--site-notice-height"] = `${top}px`;
	return variables;
}

const heights: Partial<Record<NoticeStackSource, number>> = {};

/** Report a bar's height; pass 0 when it hides or unmounts. */
export function setNoticeStackHeight(source: NoticeStackSource, height: number) {
	heights[source] = Math.max(0, height);
	const style = document.documentElement.style;
	for (const [name, value] of Object.entries(noticeStackVariables(heights))) {
		style.setProperty(name, value);
	}
}
