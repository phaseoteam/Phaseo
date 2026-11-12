export const CALLOUT_TONE_NAMES = ["info", "success", "warning", "critical"] as const;
export type CalloutTone = (typeof CALLOUT_TONE_NAMES)[number];

export type CalloutToneClasses = {
	/** The box: border and background. */
	surface: string;
	/** The title, and the icon's colour. */
	title: string;
	/** The body text. */
	description: string;
};

/**
 * The callout's tones: the coloured, icon-led box the website's model pages use for notices, and the
 * style every app uses for an explanation, warning or error shown inline (never a grey box with a
 * coloured left edge). The box is the website's alert: rounded-2xl, a 1px border, px-4 py-3.
 */
export const CALLOUT_TONES: Record<CalloutTone, CalloutToneClasses> = {
	info: {
		surface: "border-sky-200 bg-sky-50 dark:border-sky-900/60 dark:bg-sky-950/20",
		title: "text-sky-950 dark:text-sky-50",
		description: "text-sky-900/90 dark:text-sky-100/90",
	},
	success: {
		surface: "border-emerald-200 bg-emerald-50 dark:border-emerald-900/60 dark:bg-emerald-950/20",
		title: "text-emerald-950 dark:text-emerald-50",
		description: "text-emerald-900/90 dark:text-emerald-100/90",
	},
	warning: {
		surface: "border-amber-200 bg-amber-50 dark:border-amber-900/60 dark:bg-amber-900/20",
		title: "text-amber-950 dark:text-amber-50",
		description: "text-amber-900/90 dark:text-amber-100/90",
	},
	critical: {
		surface: "border-red-200 bg-red-50 dark:border-red-900/60 dark:bg-red-950/20",
		title: "text-red-950 dark:text-red-50",
		description: "text-red-900/90 dark:text-red-100/90",
	},
};
