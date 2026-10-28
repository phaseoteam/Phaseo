---
"@phaseo/slack-agent": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

The Slack agent runs recurring tasks. People ask it to do something hourly, daily, on weekdays, weekly or monthly at a local time in their Slack time zone, and it saves a self-contained prompt for that conversation with `schedule_task`, confirming the next run; `list_schedules` and `cancel_schedule` list and cancel them. Each run posts a short "Scheduled: …" message and answers in its thread as a normal answer from the person who set it up: the same access checks, one answer in the meter, the $0.50 and 12-step limits and the usual footer. A Worker cron trigger claims due runs once a minute with one indexed database call; nothing runs more than once an hour.

A run is skipped and its schedule paused when the creator can no longer use the agent, the agent is paused, or it can't post in the conversation; after 3 failures in a row the schedule pauses and the creator is told privately. Owners and admins turn recurring tasks on or off, set the most per workspace (20 by default) and who can set them up under **Recurring tasks** in Settings → Slack, where they also see every schedule and pause, resume or delete it. The Home tab lists the viewer's own. Uninstalling deletes them all.
