---
"@phaseo/web": patch
"@phaseo/web-api": patch
"@phaseo/slack-agent": patch
---

Close lower-severity access gaps: a teammate's private preset is no longer readable by id; usage app names come only from your workspace or public apps; editing, publishing, merging and deleting apps is for workspace owners and admins, and an app's URL must be http(s); the OAuth consent lookup returns only what the consent screen shows; management key responses leave out key hashes; internal admin server actions check the caller is an admin; the Slack account link page names the Slack account it links and each link works once; saving a company Slack app no longer reserves its app id until an install proves the workspace owns it.
