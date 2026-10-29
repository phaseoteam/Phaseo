export const BADGE_TONE_NAMES = ["neutral", "primary", "success", "warning", "destructive"] as const;
export type BadgeTone = (typeof BADGE_TONE_NAMES)[number];

/**
 * Small inline labels ("Free", "On Phaseo", "Deprecated"): a tinted fill and text in the tone's colour.
 * `text-link` is the mobile app's accent made readable as text; the website has no link token.
 */
export const BADGE_TONES: Record<BadgeTone, { surface: string; text: string }> = {
	neutral: { surface: "bg-muted", text: "text-muted-foreground" },
	primary: { surface: "bg-primary/12", text: "text-link" },
	success: { surface: "bg-success/12", text: "text-success" },
	warning: { surface: "bg-warning/15", text: "text-warning" },
	destructive: { surface: "bg-destructive/12", text: "text-destructive" },
};
