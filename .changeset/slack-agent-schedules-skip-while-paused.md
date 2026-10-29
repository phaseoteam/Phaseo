---
"@phaseo/slack-agent": patch
"@phaseo/web": patch
"@phaseo/docs": patch
---

Slack agent recurring tasks now skip their runs while an admin has paused the agent or a Phaseo bill is due, instead of pausing. The tasks stay active, those skipped runs don't count toward the 3 failures in a row, and each task runs again at its next time once the agent is back on, with nothing to resume. Tasks already paused for those reasons are made active again. Settings → Slack, the agent's Home tab and its list of recurring tasks say why a run was skipped (for example, "Skipped: the agent was paused"). The Slack agent guide covers this in nine languages.
