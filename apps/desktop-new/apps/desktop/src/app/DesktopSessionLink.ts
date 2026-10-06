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
      url.search ||
      url.hash
    )
      return undefined;
    const parts = url.pathname.split("/");
    if (parts.length !== 3) return undefined;
    const environmentId = decodeURIComponent(parts[1]!);
    const threadId = decodeURIComponent(parts[2]!);
    if (!/^[\w-]{1,200}$/.test(environmentId) || !/^[\w:%~.-]{1,512}$/.test(threadId))
      return undefined;
    return `${url.protocol}//app/${encodeURIComponent(environmentId)}/${encodeURIComponent(threadId)}`;
  } catch {
    return undefined;
  }
}
