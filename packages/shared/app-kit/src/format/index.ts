/**
 * Display formatters shared by the website, desktop, mobile and Factory apps. Each one is the website's own style for
 * that kind of figure, so a number reads the same wherever it shows.
 */
export { formatCompactAxisTick, formatRoundedCount } from "./counts";
export { formatUsd, formatUsdCost, formatUsdPrice, MONEY_LOCALE } from "./money";
export { formatAgoShort, formatRelativeTime, relativeUnit } from "./relativeTime";
