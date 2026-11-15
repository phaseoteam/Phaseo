export const INLINE_CHIP_TONE_NAMES = ["default", "inverse"] as const;
export type InlineChipTone = (typeof INLINE_CHIP_TONE_NAMES)[number];

export type InlineChipClasses = {
	/** The chip itself: shape, padding and the translucent tint. */
	surface: string;
	/** The label. */
	text: string;
	/** The icon's colour. */
	icon: string;
	/** Added while a pressable chip is hovered or pressed. */
	pressed: string;
};

/**
 * The inline chip: a mentioned file, folder, chat, model, attachment or link shown inside text, in a
 * composer and in messages. It is the desktop composer's chip, and every app draws it from here.
 *
 * The fill is a translucent tint of the text colour, so a chip reads on the page, inside an input and in
 * a message bubble alike. `inverse` is for chips on an inverted surface, such as a dark message bubble
 * drawn with `bg-foreground`. Sizing that only the web can express (em font size, baseline alignment,
 * icon size through `[&_svg]`) lives in each platform's component.
 */
export const INLINE_CHIP_TONES: Record<InlineChipTone, InlineChipClasses> = {
	default: {
		surface: "rounded-md bg-foreground/8 px-1.5",
		text: "font-medium text-foreground/90",
		icon: "text-muted-foreground",
		pressed: "bg-foreground/14",
	},
	inverse: {
		surface: "rounded-md bg-background/16 px-1.5",
		text: "font-medium text-background",
		icon: "text-background/70",
		pressed: "bg-background/24",
	},
};

/**
 * The embedded chip: the same chip set into a model's reply. Body-size text at the body weight, a fainter
 * tint and tighter padding, so a reference reads as part of the sentence and still looks clickable.
 * Composers and the people's own messages keep the token chip above.
 */
export const INLINE_CHIP_EMBEDDED: InlineChipClasses = {
	surface: "rounded-md bg-foreground/6 px-1",
	text: "text-foreground",
	icon: "text-muted-foreground",
	pressed: "bg-foreground/11",
};

export const INLINE_CHIP_ACCENT_NAMES = ["open", "done", "closed", "draft", "error"] as const;
export type InlineChipAccent = (typeof INLINE_CHIP_ACCENT_NAMES)[number];

/**
 * The only colour a chip carries: its icon, and only when the colour says something. Pull requests and
 * issues use GitHub's colours (open green, merged or completed violet, closed red, draft grey); `error` is
 * a reference that could not be opened. Everything else keeps the muted icon.
 */
export const INLINE_CHIP_ACCENTS: Record<InlineChipAccent, string> = {
	open: "text-emerald-600 dark:text-emerald-400",
	done: "text-violet-600 dark:text-violet-400",
	closed: "text-red-600 dark:text-red-400",
	draft: "text-zinc-500 dark:text-zinc-400",
	error: "text-destructive",
};
