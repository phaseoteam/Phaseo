/** The threshold for turning a paste into a text attachment: 32 KiB, counted in bytes, since some scripts take several per character. */
export const largePasteBytes = 32 * 1024;
export const isLargePaste = (text: string) => text.length >= largePasteBytes || new TextEncoder().encode(text).byteLength >= largePasteBytes;
