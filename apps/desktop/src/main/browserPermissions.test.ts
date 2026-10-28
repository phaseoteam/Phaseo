import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BrowserWindow, Session, WebContents } from "electron";
vi.mock("electron", () => ({ dialog: { showMessageBox: vi.fn() } }));
import { dialog } from "electron";
import { BrowserPermissions } from "./browserPermissions";
type Request = NonNullable<Parameters<Session["setPermissionRequestHandler"]>[0]>;
type Check = NonNullable<Parameters<Session["setPermissionCheckHandler"]>[0]>;
function fixture() {
 const window = { isDestroyed: () => false } as BrowserWindow;
 let url = "https://owned.example/page", focused = true, visible = true;
 const contents = Object.assign(new EventEmitter(), { getURL: () => url, isDestroyed: () => false, isFocused: () => focused }) as unknown as WebContents;
 let request!: Request, check!: Check;
 const session = { setPermissionRequestHandler: vi.fn(handler => { request = handler; }), setPermissionCheckHandler: vi.fn(handler => { check = handler; }) } as unknown as Session;
 const service = new BrowserPermissions(candidate => candidate === contents ? { owner: window, visible } : undefined); service.configure(session); service.register(contents);
 return { service, session, contents, window, request: (...args: Parameters<Request>) => request(...args), check: (...args: Parameters<Check>) => check(...args), navigate: (next = url) => { url = next; contents.emit("did-start-navigation", {}, url, false, true); }, focus: (value: boolean) => { focused = value; }, hide: () => { visible = false; service.cancel(contents); } };
}
const details = { requestingUrl: "https://owned.example/page", isMainFrame: true };
const checks = { isMainFrame: true };
beforeEach(() => { vi.mocked(dialog.showMessageBox).mockReset(); });
describe("Browser site permissions", () => {
 it("requires an explicit origin-labelled decision and retains it only for that page", async () => {
  const own = fixture(), callback = vi.fn(); vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
  expect(own.check(own.contents, "notifications", "https://owned.example", checks)).toBe(false);
  own.request(own.contents, "notifications", callback, details);
  await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
  expect(dialog.showMessageBox).toHaveBeenCalledWith(own.window, expect.objectContaining({ message: "Allow https://owned.example to show notifications?", defaultId: 0, cancelId: 0, buttons: ["Deny", "Allow for this page"] }));
  expect(own.check(own.contents, "notifications", "https://owned.example", checks)).toBe(true);
  expect(own.check(null, "notifications", "https://owned.example", checks)).toBe(true);
  expect(own.check(null, "notifications", "https://foreign.example", checks)).toBe(false);
  own.navigate(); expect(own.check(own.contents, "notifications", "https://owned.example", checks)).toBe(false);
 });
 it("does not reuse camera access as microphone access", async () => {
  const own = fixture(), callback = vi.fn(); vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
  own.request(own.contents, "media", callback, { ...details, mediaTypes: ["video"] }); await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
  expect(own.check(own.contents, "media", "https://owned.example", { ...checks, mediaType: "video" })).toBe(true);
  expect(own.check(own.contents, "media", "https://owned.example", { ...checks, mediaType: "audio" })).toBe(false);
  expect(own.check(own.contents, "media", "https://owned.example", { ...checks, mediaType: "unknown" })).toBe(false);
  expect(dialog.showMessageBox).toHaveBeenCalledWith(own.window, expect.objectContaining({ message: "Allow https://owned.example to use your camera?" }));
 });
 it("retains approved background-page access while preventing new hidden-page prompts", async () => {
  const own = fixture(), callback = vi.fn(); vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 1, checkboxChecked: false });
  own.request(own.contents, "notifications", callback, details); await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(true));
  own.hide(); expect(own.check(own.contents, "notifications", "https://owned.example", checks)).toBe(true);
  expect(own.check(null, "notifications", "https://owned.example", checks)).toBe(true);
  own.request(own.contents, "notifications", callback, details); expect(callback).toHaveBeenLastCalledWith(true);
  own.request(own.contents, "geolocation", callback, details); expect(callback).toHaveBeenLastCalledWith(false); expect(dialog.showMessageBox).toHaveBeenCalledOnce();
  own.navigate(); expect(own.check(null, "notifications", "https://owned.example", checks)).toBe(false);
 });
 it("retains denial without repeatedly prompting until reload", async () => {
  const own = fixture(), callback = vi.fn(); vi.mocked(dialog.showMessageBox).mockResolvedValue({ response: 0, checkboxChecked: false });
  own.request(own.contents, "geolocation", callback, details); await vi.waitFor(() => expect(callback).toHaveBeenCalledWith(false));
  own.request(own.contents, "geolocation", callback, details); expect(dialog.showMessageBox).toHaveBeenCalledOnce();
  own.navigate(); own.request(own.contents, "geolocation", callback, details); expect(dialog.showMessageBox).toHaveBeenCalledTimes(2);
 });
 it.each(["navigation", "hide", "destroy"] as const)("cancels a stale native prompt on %s and ignores a late grant", async reason => {
  const own = fixture(), callback = vi.fn(); let resolve!: (value: Electron.MessageBoxReturnValue) => void;
  vi.mocked(dialog.showMessageBox).mockReturnValue(new Promise(done => { resolve = done; })); own.request(own.contents, "clipboard-read", callback, details);
  const signal = (vi.mocked(dialog.showMessageBox).mock.calls[0] as unknown as [BrowserWindow, Electron.MessageBoxOptions])[1].signal!;
  if (reason === "navigation") own.navigate("https://foreign.example"); else if (reason === "hide") own.hide(); else own.contents.emit("destroyed");
  expect(signal.aborted).toBe(true); expect(callback).toHaveBeenCalledExactlyOnceWith(false); resolve({ response: 1, checkboxChecked: false }); await Promise.resolve();
  expect(callback).toHaveBeenCalledOnce(); expect(own.check(own.contents, "clipboard-read", "https://owned.example", checks)).toBe(false);
 });
 it("bounds active prompts and fails closed for unsupported or foreign requests", () => {
  const own = fixture(); vi.mocked(dialog.showMessageBox).mockReturnValue(new Promise(() => {}));
  own.request(own.contents, "notifications", vi.fn(), details);
  const blocked = vi.fn(); own.request(own.contents, "geolocation", blocked, details); expect(blocked).toHaveBeenCalledWith(false); expect(dialog.showMessageBox).toHaveBeenCalledOnce();
  own.service.cancel(own.contents); vi.mocked(dialog.showMessageBox).mockClear();
  for (const permission of ["display-capture", "openExternal", "fileSystem", "storage-access", "unknown"] as const) own.request(own.contents, permission, blocked, details);
  for (const requestingUrl of ["https://foreign.example", "file:///owned", "https://user:pass@owned.example/"]) own.request(own.contents, "notifications", blocked, { ...details, requestingUrl });
  own.request(own.contents, "notifications", blocked, { ...details, isMainFrame: false });
  own.request(own.contents, "media", blocked, { ...details, mediaTypes: [] });
  expect(dialog.showMessageBox).not.toHaveBeenCalled();
 });
 it("allows sanitized clipboard writes only from the focused visible main page", () => {
  const own = fixture(); expect(own.check(own.contents, "clipboard-sanitized-write", "https://owned.example", checks)).toBe(true);
  own.focus(false); expect(own.check(own.contents, "clipboard-sanitized-write", "https://owned.example", checks)).toBe(false);
  own.focus(true); expect(own.check(own.contents, "clipboard-sanitized-write", "https://owned.example", { isMainFrame: false })).toBe(false);
  expect(own.check(own.contents, "clipboard-read", "https://owned.example", checks)).toBe(false);
  own.hide(); expect(own.check(own.contents, "clipboard-sanitized-write", "https://owned.example", checks)).toBe(false); expect(dialog.showMessageBox).not.toHaveBeenCalled();
 });
 it.each(["sync", "async"] as const)("settles native dialog %s failures without granting access", async failure => {
  const own = fixture(), callback = vi.fn();
  if (failure === "sync") vi.mocked(dialog.showMessageBox).mockImplementation(() => { throw Error("Owned unavailable dialog"); }); else vi.mocked(dialog.showMessageBox).mockRejectedValue(Error("Owned unavailable dialog"));
  own.request(own.contents, "notifications", callback, details); await vi.waitFor(() => expect(callback).toHaveBeenCalledExactlyOnceWith(false));
  expect(own.check(own.contents, "notifications", "https://owned.example", checks)).toBe(false);
  own.service.configure(own.session); expect(own.session.setPermissionRequestHandler).toHaveBeenCalledOnce();
 });
});
