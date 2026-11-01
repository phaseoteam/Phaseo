import fs from "node:fs";
import path from "node:path";
import { chatOpens, inApp, launchHref, launchReset, leadsWithSidebar, sectionDepth, sectionSwitch, sidebarItems, sidebarMove, stackedSections } from "./navigation";

const APP = path.resolve(__dirname, "../../../app");

/** The route files Expo Router would match for a path, inside the (app) group or at the root. */
function routeFiles(href: string) {
  const route = href.split("?")[0]!.replace(/\/$/, "");
  return ["(app)", ""].flatMap((group) => [path.join(APP, group, route, "index.tsx"), path.join(APP, group, `${route}.tsx`)]).filter((file) => fs.existsSync(file));
}

describe("where the app opens", () => {
  it("opens a new chat when signed in and the public Models catalogue when signed out", () => {
    expect(launchHref(true)).toBe("/chat");
    expect(launchHref(false)).toBe("/models");
  });

  it("sends / (Home's old address) to that screen, and has only one route for it", () => {
    const files = routeFiles("/");
    expect(files.map((file) => path.relative(APP, file).replace(/\\/g, "/"))).toEqual(["(app)/index.tsx"]);
    const source = fs.readFileSync(files[0]!, "utf8");
    expect(source).toContain("<Redirect href={launchHref(Boolean(session))} />");
    expect(fs.existsSync(path.join(APP, "(app)", "(home)"))).toBe(false);
  });

  it("still has a screen at every old tab address and link target", () => {
    for (const href of ["/models", "/providers", "/compare", "/chat", "/code", "/account", "/account/usage", "/desktops", "/pair", launchHref(true), launchHref(false)]) {
      expect([href, routeFiles(href).length]).toEqual([href, 1]);
    }
  });
});

describe("the sidebar's footer", () => {
  const labels = (split: boolean, signedIn: boolean) => sidebarItems({ split, signedIn }).map((item) => item.label);

  it("lists Models, Providers and Usage on phones, with Compare under Models on tablets", () => {
    expect(labels(false, true)).toEqual(["Models", "Providers", "Usage"]);
    expect(labels(true, true)).toEqual(["Models", "Compare", "Providers", "Usage"]);
  });

  it("leaves out Usage before signing in", () => {
    expect(labels(false, false)).toEqual(["Models", "Providers"]);
    expect(labels(true, false)).toEqual(["Models", "Compare", "Providers"]);
  });

  it("only links to screens that exist", () => {
    for (const item of sidebarItems({ split: true, signedIn: true })) expect([item.href, routeFiles(item.href).length]).toEqual([item.href, 1]);
  });
});

describe("opening a screen from the sidebar", () => {
  it("pushes a section over Chat, so back returns to it", () => {
    expect(sidebarMove("/chat", "/models", true)).toBe("push");
    expect(sidebarMove("/chat/abc", "/account/usage", true)).toBe("push");
    expect(sidebarMove("/chat/abc", "/code", true, ["/chat"])).toBe("push");
  });

  it("switches from one section to another at its root, rather than stacking them", () => {
    expect(sidebarMove("/models/openai/gpt-5", "/providers", true, ["/chat", "/models"])).toBe("switch");
    expect(sidebarMove("/account/keys", "/account/usage", true, ["/chat", "/account"])).toBe("switch");
    // Model → model detail → Compare, then Providers: Models goes too, so back from Providers is Chat.
    expect(sidebarMove("/compare", "/providers", true, ["/chat", "/models", "/compare"])).toBe("switch");
  });

  it("resets the open section to its root when it's chosen again", () => {
    expect(sidebarMove("/code/desk-1/c1", "/code", true, ["/chat", "/code"])).toBe("switch");
    expect(sidebarMove("/models/openai/gpt-5", "/models", true, ["/chat", "/models"])).toBe("switch");
    expect(sidebarMove("/compare", "/models", true, ["/chat", "/models", "/compare"])).toBe("switch");
  });

  it("goes back to Chat for a chat, instead of opening a second Chat", () => {
    expect(sidebarMove("/models/openai/gpt-5", "/chat/abc", true)).toBe("back");
    expect(sidebarMove("/code/desk-1/c1", "/chat/new", true)).toBe("back");
  });

  it("opens a detail in the current screen's place, or goes back to it in a section already under the current one", () => {
    expect(sidebarMove("/code/desk-1/c1", "/code/desk-1/c2", true, ["/chat", "/code"])).toBe("replace");
    expect(sidebarMove("/compare", "/models/openai/gpt-5", true, ["/chat", "/models", "/compare"])).toBe("back");
  });

  it("does nothing for the screen already open", () => {
    expect(sidebarMove("/compare", "/compare", true)).toBe("stay");
  });

  it("treats Models as the launch screen when signed out", () => {
    expect(sidebarMove("/models", "/providers", false)).toBe("push");
    expect(sidebarMove("/providers", "/account", false, ["/models", "/providers"])).toBe("switch");
    expect(sidebarMove("/providers/groq", "/models", false)).toBe("back");
  });

  it("treats / as the launch screen before its redirect runs, for a notification that launched the app", () => {
    expect(sidebarMove("/", "/models", true)).toBe("push");
    expect(sidebarMove("/", "/code/desk-1/c2", true)).toBe("push");
    expect(sidebarMove("/", "/chat/abc", true)).toBe("back");
  });
});

describe("switching section", () => {
  const chat = { key: "chat-1", name: "chat", state: { routes: [{ name: "index" }, { name: "[id]" }] } };
  const app = { key: "stack-app", type: "stack", index: 2, routeNames: ["index", "chat", "models", "compare", "providers", "account", "code"], stale: false, routes: [chat, { key: "m", name: "models" }, { key: "c", name: "compare" }] };
  const inRoot = (state: object) => ({ routes: [{ name: "__root", state: { routes: [{ name: "(app)", state }] } }] });

  it("keeps the open chat as it was and puts the section over it at its root, closing everything else", () => {
    expect(sectionSwitch(inRoot(app), "/providers", true)).toEqual({
      type: "RESET",
      target: "stack-app",
      payload: { ...app, stale: false, index: 1, routes: [chat, { name: "providers" }], preloadedRoutes: [] },
    });
  });

  it("opens Usage alone in Account's stack, so back from it is Chat", () => {
    expect(sectionSwitch(inRoot(app), "/account/usage", true)?.payload.routes[1]).toEqual({ name: "account", state: { routes: [{ name: "usage" }] } });
  });

  it("keeps the launch redirect under a section a notification opened, and Models when signed out", () => {
    const launched = inRoot({ ...app, routes: [{ key: "i", name: "index" }, { key: "k", name: "code" }] });
    expect(sectionSwitch(launched, "/models", true)?.payload.routes).toEqual([{ key: "i", name: "index" }, { name: "models" }]);
    const signedOut = inRoot({ ...app, routes: [{ key: "m", name: "models" }, { key: "p", name: "providers" }] });
    expect(sectionSwitch(signedOut, "/account", false)?.payload.routes).toEqual([{ key: "m", name: "models" }, { name: "account" }]);
  });

  it("does nothing before the app's stack has mounted", () => {
    expect(sectionSwitch(undefined, "/models", true)).toBeNull();
  });
});

describe("the header and the drawer's swipe on phones", () => {
  it("lead with the sidebar on Chat and on each section's root, as the sidebar opens them", () => {
    for (const path of ["/", "/chat", "/chat/abc", "/models", "/providers", "/code", "/account", "/account/usage"]) {
      expect([path, leadsWithSidebar(path, 0)]).toEqual([path, true]);
    }
  });

  it("keep back on details: a section's detail, Usage over Account, a provider opened from a model, and Compare", () => {
    expect(leadsWithSidebar("/models/openai/gpt-5", 1)).toBe(false);
    expect(leadsWithSidebar("/code/desk-1/c1", 1)).toBe(false);
    expect(leadsWithSidebar("/account/usage", 1)).toBe(false);
    expect(leadsWithSidebar("/providers/groq", 0)).toBe(false);
    expect(leadsWithSidebar("/compare", 0)).toBe(false);
  });

  it("read the open section's depth from the app's stack", () => {
    const at = (code: object) => ({ routes: [{ name: "(app)", state: { index: 1, routes: [{ name: "chat" }, { name: "code", state: code }] } }] });
    expect(sectionDepth(at({ index: 1, routes: [{ name: "index" }, { name: "[desktopId]/[chatId]" }] }))).toBe(1);
    expect(sectionDepth(at({ index: 0, routes: [{ name: "index" }] }))).toBe(0);
    expect(sectionDepth(undefined)).toBe(0);
  });

  it("close the drawer for screens in the app, not for sign-in, pairing or sheets opened over it", () => {
    expect(["/", "/chat/abc", "/models/openai/gpt-5", "/compare", "/account/usage", "/code/desk-1/c1"].every(inApp)).toBe(true);
    expect(["/pair", "/sign-in", "/sheets/compare", "/filters/models"].some(inApp)).toBe(false);
  });
});

describe("the app's stack", () => {
  it("lists its sections bottom first, with the launch redirect as /", () => {
    const root = { routes: [{ name: "__root", state: { routes: [{ name: "(app)", state: { key: "app", routes: [{ name: "index" }, { name: "chat" }, { name: "code" }] } }] } }] };
    expect(stackedSections(root)).toEqual(["/", "/chat", "/code"]);
    expect(stackedSections(undefined)).toEqual([]);
  });

  it("keeps Chat one screen: a chat from the sidebar takes the open chat's place, and goes back to Chat from elsewhere", () => {
    expect(chatOpens("/chat")).toBe("replace");
    expect(chatOpens("/chat/abc")).toBe("replace");
    expect(chatOpens("/code/desk-1/c1")).toBe("screen");
    expect(sidebarMove("/code/desk-1/c1", "/chat/abc", true, ["/chat", "/code"])).toBe("back");
  });

  it("sends old Code links to the new screens with the Code list under them", () => {
    for (const old of ["(app)/chat/code/[desktopId]/[chatId].tsx", "(app)/chat/code/[desktopId]/new.tsx", "desktops/[desktopId]/[chatId].tsx", "desktops/[desktopId]/new.tsx"]) {
      expect([old, fs.readFileSync(path.join(APP, old), "utf8").includes("withAnchor />")]).toEqual([old, true]);
    }
  });
});

describe("signing in or out", () => {
  const app = { key: "stack-app", type: "stack", index: 2, routeNames: ["index", "chat", "models"], routeKeySeq: 3, stale: false, routes: [{ key: "a", name: "index" }, { key: "b", name: "models" }, { key: "c", name: "providers" }] };
  const root = { key: "root", routes: [{ key: "r", name: "__root", state: { key: "root-stack", routes: [{ key: "x", name: "(app)", state: app }, { key: "y", name: "sign-in" }] } }] };

  it("resets the app's stack to Chat alone after signing in, keeping the stack's own fields", () => {
    expect(launchReset(root, true)).toEqual({
      type: "RESET",
      target: "stack-app",
      payload: { ...app, stale: false, index: 0, routes: [{ name: "chat" }], preloadedRoutes: [] },
    });
  });

  it("resets it to Models alone after signing out", () => {
    expect(launchReset(root, false)?.payload.routes).toEqual([{ name: "models" }]);
  });

  it("does nothing before the app's stack has mounted", () => {
    expect(launchReset(undefined, true)).toBeNull();
    expect(launchReset({ routes: [{ name: "__root", state: { routes: [{ name: "auth/callback" }] } }] }, true)).toBeNull();
  });
});
