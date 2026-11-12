// Phones need roughly 40px to tap reliably. These classes keep a small control's
// look and grow only its touch area below `sm`, with an invisible ::after box.
// Space neighbouring controls out (12–16px between 24px icons) so the enlarged
// areas overlap by a few pixels at most.

/** 24px control → 40px touch area on phones. */
export const TAP_TARGET_24 =
	"max-sm:relative max-sm:after:absolute max-sm:after:-inset-2 max-sm:after:content-['']";

/** 20px control → 40px touch area on phones. */
export const TAP_TARGET_20 =
	"max-sm:relative max-sm:after:absolute max-sm:after:-inset-2.5 max-sm:after:content-['']";

/** 28px control → 36px touch area on phones, for tight rows with 8px gaps. */
export const TAP_TARGET_28_TIGHT =
	"max-sm:relative max-sm:after:absolute max-sm:after:-inset-1 max-sm:after:content-['']";

/** The 40px touch box for a 28px control, without `relative`: for controls that are already positioned. */
export const TAP_AREA_28 = "max-sm:after:absolute max-sm:after:-inset-1.5 max-sm:after:content-['']";

/** 28px control → 40px touch area on phones. */
export const TAP_TARGET_28 = `max-sm:relative ${TAP_AREA_28}`;
