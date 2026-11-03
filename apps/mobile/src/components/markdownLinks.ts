const ALLOWED_SCHEMES = new Set(["https", "http", "mailto"]);

/**
 * Whether a link from rendered markdown may be opened. Markdown comes from model output, so only web and mail links are
 * allowed; other schemes (tel:, sms:, intent:, app deep links) could trigger actions on the device.
 * Parsed with a regex because React Native's URL polyfill does not implement `protocol`.
 */
export function isOpenableMarkdownLink(url: string): boolean {
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(url.trim())?.[1];
  return scheme !== undefined && ALLOWED_SCHEMES.has(scheme.toLowerCase());
}
