import { directTransport, relayTransport, type DesktopTransport, type OpenSocket } from "./transport";

/**
 * A paired desktop as this phone keeps it, in secure storage: this phone's private key, the desktop's public key and
 * the relay token for Phaseo Connect. Direct connections sign in by proving the key, so there is no token for them.
 */
export type SavedDesktop = {
  desktopId: string;
  desktopName: string;
  deviceId: string;
  deviceName: string;
  relayToken: string;
  privateKey: string;
  publicKey: string;
  desktopPublicKey: string;
  direct: string[];
  connect?: { relayUrl: string; desktopId: string };
  pairedAt: string;
};

export type FetchLike = (url: string, init: { method?: string; headers?: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

/** How long a direct URL has to answer before Connect is tried. */
export const directProbeMs = 1500;

/** True when the desktop's phone server answers at `url` within `ms` and is the expected desktop. */
export async function probeDirect(url: string, desktopId: string, fetcher: FetchLike, ms = directProbeMs) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    const response = await fetcher(`${url.replace(/\/+$/, "")}/v1/phone/health`, { signal: abort.signal });
    if (!response.ok) return false;
    const body = await response.json() as { ok?: unknown; desktopId?: unknown } | null;
    return body?.ok === true && body.desktopId === desktopId;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** The first of `urls` to answer, or null when none does within the probe time. */
export async function firstReachable(urls: string[], desktopId: string, fetcher: FetchLike, ms = directProbeMs): Promise<string | null> {
  if (!urls.length) return null;
  return Promise.any(urls.map(async (url) => {
    if (await probeDirect(url, desktopId, fetcher, ms)) return url;
    throw new Error("unreachable");
  })).catch(() => null);
}

/** A direct URL that answers in time, else Phaseo Connect when the desktop offered it, else nothing. */
export async function chooseTransport(desktop: SavedDesktop, deps: { fetch: FetchLike; openSocket: OpenSocket; probeMs?: number }): Promise<DesktopTransport | null> {
  const url = await firstReachable(desktop.direct, desktop.desktopId, deps.fetch, deps.probeMs);
  const keys = { deviceId: desktop.deviceId, privateKey: desktop.privateKey, desktopPublicKey: desktop.desktopPublicKey };
  if (url) return directTransport({ url, keys, openSocket: deps.openSocket });
  if (desktop.connect) {
    return relayTransport({
      openSocket: deps.openSocket,
      credentials: { ...keys, relayUrl: desktop.connect.relayUrl, desktopId: desktop.desktopId, relayToken: desktop.relayToken },
    });
  }
  return null;
}
