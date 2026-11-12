---
"@phaseo/gateway-api": minor
---

Push low balance to the Phaseo mobile app whether or not the workspace's low-balance email is on. Every five minutes the push job checks the workspaces whose owners or admins get money pushes, against the workspace's low-balance threshold or $5 without one, and pushes once when the balance drops to or below it, re-arming once it is back above. A workspace first seen below the threshold, such as one that never bought credits, is not told. A drop while auto top-up is on and working is not pushed, since a failed top-up has its own push. The push says how long the balance lasts at the last seven days' pace. Low-balance emails are no longer turned into pushes, so each drop is pushed once; the email itself is unchanged.
