---
"@phaseo/web": minor
"@phaseo/web-api": minor
"@phaseo/gateway-api": patch
---

Chat's model picker now lists only the models the workspace picked in the header lets you use, with a note saying how many its rules hide (and which one, when a search matches a hidden model). Signed-in users can filter `/models` to "Usable in my workspace" (`?usable=1`), and models those rules block are tagged "Blocked by your workspace". The rules are the same ones Chat requests are checked against: the workspace's privacy settings and the guardrails on your departments, your membership and your Chat key. Chat no longer switches to another workspace when the one picked in the header can't be used; it asks you to pick another.
