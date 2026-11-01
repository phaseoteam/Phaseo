import fs from "node:fs";
import path from "node:path";
import { launchHref, launchReset, sidebarItems, sidebarMove } from "./navigation";

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
    for (const href of ["/models", "/providers", "/compare", "/chat", "/account", "/account/usage", "/desktops", "/pair", launchHref(true), launchHref(false)]) {
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
  it("pushes screens over Chat, so back returns to it", () => {
    expect(sidebarMove("/chat", "/models", true)).toBe("push");
    expect(sidebarMove("/chat/abc", "/account/usage", true)).toBe("push");
  });

  it("swaps one screen for another rather than stacking them", () => {
    expect(sidebarMove("/models/openai/gpt-5", "/providers", true)).toBe("replace");
    expect(sidebarMove("/account/keys", "/account/usage", true)).toBe("replace");
  });

  it("goes back to Chat for a chat, instead of opening a second Chat", () => {
    expect(sidebarMove("/models/openai/gpt-5", "/chat/abc", true)).toBe("back");
    expect(sidebarMove("/providers", "/chat/code/desk-1/new", true)).toBe("back");
  });

  it("does nothing for the screen already open", () => {
    expect(sidebarMove("/compare", "/compare", true)).toBe("stay");
  });

  it("treats Models as the launch screen when signed out", () => {
    expect(sidebarMove("/models", "/providers", false)).toBe("push");
    expect(sidebarMove("/providers", "/compare", false)).toBe("replace");
    expect(sidebarMove("/compare", "/models", false)).toBe("back");
  });

  it("treats / as the launch screen before its redirect runs, for a notification that launched the app", () => {
    expect(sidebarMove("/", "/models", true)).toBe("push");
    expect(sidebarMove("/", "/chat/code/desk-1/c2", true)).toBe("replace");
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
