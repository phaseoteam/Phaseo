import { dialog, type BrowserWindow, type Session, type WebContents } from "electron";

type RequestHandler = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
type CheckHandler = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
const labels: Record<string, string> = {
 "clipboard-read": "read your clipboard", notifications: "show notifications", geolocation: "use your location",
 midi: "use MIDI devices", midiSysex: "send MIDI system messages", fullscreen: "enter fullscreen",
 pointerLock: "capture your pointer", keyboardLock: "capture keyboard input", "idle-detection": "check whether you are idle",
};
function origin(value: string) {
 try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password ? url.origin : undefined; }
 catch { return undefined; }
}

export class BrowserPermissions {
 private configured = new WeakSet<Session>();
 private decisions = new Map<WebContents, Map<string, boolean>>();
 private pending = new Map<WebContents, { controller: AbortController; finish: (allowed: boolean) => void; owner: BrowserWindow }>();
 constructor(private ownerFor: (contents: WebContents) => { owner: BrowserWindow; visible: boolean } | undefined) {}
 configure(session: Session) {
  if (this.configured.has(session)) return;
  this.configured.add(session);
  session.setPermissionRequestHandler(this.request);
  session.setPermissionCheckHandler(this.check);
 }
 register(contents: WebContents) {
  contents.on("did-start-navigation", (_event, _url, inPlace, mainFrame) => { if (mainFrame && !inPlace) this.clear(contents); });
  contents.once("destroyed", () => this.clear(contents));
 }
 cancel(contents: WebContents) {
  const pending = this.pending.get(contents);
  if (pending) { pending.controller.abort(); pending.finish(false); }
 }
 private clear(contents: WebContents) { this.cancel(contents); this.decisions.delete(contents); }
 private page(contents: WebContents | null, requested: string, mainFrame: boolean) {
  if (!contents || contents.isDestroyed() || !mainFrame) return undefined;
  const owned = this.ownerFor(contents), site = origin(requested);
  return owned && !owned.owner.isDestroyed() && site && site === origin(contents.getURL()) ? { ...owned, site } : undefined;
 }
 private check: CheckHandler = (contents, permission, requestingOrigin, details) => {
  if (!contents && permission === "notifications") {
   for (const [candidate, decisions] of this.decisions) if (this.page(candidate, requestingOrigin, true) && decisions.get("notifications")) return true;
   return false;
  }
  const page = this.page(contents, requestingOrigin, details.isMainFrame);
  if (!page) return false;
  if (permission === "clipboard-sanitized-write") return page.visible && contents!.isFocused();
  const key = permission === "media" ? `media:${details.mediaType}` : permission;
  return this.decisions.get(contents!)?.get(key) === true;
 };
 private request: RequestHandler = (contents, permission, callback, details) => {
  const page = this.page(contents, details.requestingUrl, details.isMainFrame);
  if (!page) { callback(false); return; }
  if (permission === "clipboard-sanitized-write") { callback(page.visible && contents.isFocused()); return; }
  let keys = [permission as string], label = labels[permission];
  if (permission === "media") {
   const media = "mediaTypes" in details ? details.mediaTypes : undefined;
   if (!media?.length || media.some(value => value !== "audio" && value !== "video") || ("securityOrigin" in details && details.securityOrigin && origin(details.securityOrigin) !== page.site)) { callback(false); return; }
   keys = [...new Set(media)].map(value => `media:${value}`);
   label = media.includes("audio") && media.includes("video") ? "use your microphone and camera" : media.includes("audio") ? "use your microphone" : "use your camera";
  }
  if (!label) { callback(false); return; }
  const decisions = this.decisions.get(contents);
  if (keys.some(key => decisions?.get(key) === false)) { callback(false); return; }
  if (keys.every(key => decisions?.get(key) === true)) { callback(true); return; }
  if (!page.visible) { callback(false); return; }
  if ([...this.pending.values()].some(value => value.owner === page.owner)) { callback(false); return; }
  const controller = new AbortController();
  const finish = (allowed: boolean) => {
   if (this.pending.get(contents)?.controller !== controller) return;
   this.pending.delete(contents);
   callback(allowed);
  };
  this.pending.set(contents, { owner: page.owner, controller, finish });
  try { void dialog.showMessageBox(page.owner, {
   type: "question", title: "Site permission", message: `Allow ${page.site} to ${label}?`,
   detail: "Applies to this page until you navigate or reload.", buttons: ["Deny", "Allow for this page"], defaultId: 0, cancelId: 0, noLink: true, signal: controller.signal,
  }).then(result => {
   if (controller.signal.aborted || !this.page(contents, details.requestingUrl, true)?.visible) { finish(false); return; }
   const allowed = result.response === 1, updated = this.decisions.get(contents) ?? new Map<string, boolean>();
   for (const key of keys) updated.set(key, allowed);
   this.decisions.set(contents, updated); finish(allowed);
  }).catch(() => finish(false)); } catch { finish(false); }
 };
}
