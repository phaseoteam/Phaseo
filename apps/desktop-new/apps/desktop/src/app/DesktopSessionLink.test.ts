import { expect, it } from "vite-plus/test";
import { desktopSessionLink } from "./DesktopSessionLink.ts";
it("opens only a safe chat route in the correct desktop build", () => {
  expect(desktopSessionLink("t3code://app/env-1/chat-2", false)).toBe("t3code://app/env-1/chat-2");
  expect(desktopSessionLink("t3code-dev://app/env-1/chat-2", true)).toBeDefined();
  for (const url of [
    "https://evil.test/env/chat",
    "t3code://other/env/chat",
    "t3code://app/env/chat?redirect=https://evil.test",
    "t3code://app/env/chat#script",
    "t3code://app/settings",
    "t3code-dev://app/env/chat",
  ])
    expect(desktopSessionLink(url, false)).toBeUndefined();
});
