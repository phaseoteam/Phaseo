/** Accept only an app-local chat route, never an external navigation destination. */
export function desktopSessionLink(
  value: string | undefined,
  development: boolean,
): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== (development ? "t3code-dev:" : "t3code:") ||
      url.host !== "app" ||
      url.username ||
      url.password ||
      !/^\/[\w-]{1,200}\/[\w-]{1,200}$/.test(url.pathname) ||
      url.search ||
      url.hash
    )
      return undefined;
    return url.toString();
  } catch {
    return undefined;
  }
}
