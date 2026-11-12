/**
 * The mobile app's type scale, in pixels so it doesn't follow the website's rem sizes. Montserrat sets about 7% wider
 * than the DM Sans our reference scale was drawn in (same x-height), so each role is that scale's size less 7%,
 * rounded, which keeps line lengths the same; line heights keep the reference's ratio. Captions stay at 12 to stay
 * legible.
 */
export const TEXT_VARIANTS = {
	display: "text-[28px] leading-[34px] font-bold tracking-tight text-foreground",
	title: "text-[20px] leading-[27px] font-bold tracking-tight text-foreground",
	heading: "text-[17px] leading-[22px] font-semibold text-foreground",
	body: "text-[15px] leading-[22px] text-foreground",
	label: "text-[13px] leading-[18px] font-semibold text-foreground",
	small: "text-[12px] leading-4 text-foreground",
	muted: "text-[13px] leading-[18px] text-muted-foreground",
	caption: "text-[12px] leading-4 text-muted-foreground",
	mono: "font-mono text-[12px] leading-4 text-muted-foreground",
} as const;
export type TextVariant = keyof typeof TEXT_VARIANTS;
