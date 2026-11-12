/**
 * Request header asking for a page's full head (title, description, Open
 * Graph) in the first HTML instead of streaming it. The Markdown version of a
 * page (lib/markdown) sets it on the HTML render it converts.
 */
export const COMPLETE_HEAD_HEADER = "x-phaseo-complete-head";
