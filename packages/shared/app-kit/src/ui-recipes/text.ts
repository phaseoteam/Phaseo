/** The mobile app's type scale, in pixels so it doesn't follow the website's rem sizes. */
export const TEXT_VARIANTS = {
	display: "text-[28px] leading-[34px] font-bold tracking-tight text-foreground",
	title: "text-[22px] leading-7 font-bold tracking-tight text-foreground",
	heading: "text-[17px] leading-6 font-semibold text-foreground",
	body: "text-[15px] leading-[22px] text-foreground",
	label: "text-[14px] leading-5 font-semibold text-foreground",
	small: "text-[13px] leading-[18px] text-foreground",
	muted: "text-[14px] leading-5 text-muted-foreground",
	caption: "text-[12px] leading-4 text-muted-foreground",
	mono: "font-mono text-[12px] leading-4 text-muted-foreground",
} as const;
export type TextVariant = keyof typeof TEXT_VARIANTS;
