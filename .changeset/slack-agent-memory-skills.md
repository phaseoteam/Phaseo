---
"@phaseo/slack-agent": patch
"@phaseo/web": patch
"@phaseo/web-api": patch
---

The Slack agent has a memory and saved skills. People can ask it to remember notes, pin things it should always keep in mind and track to-dos, for one channel or the whole Slack workspace, and to save skills: named instructions for tasks they repeat. Turns get `remember`, `recall`, `update_todo`, `forget`, `save_skill`, `list_skills` and `use_skill`, and see the conversation's pins and the saved skills' names. Notes are short and in the agent's own words, never copies of Slack messages, at most 500 notes and 100 skills per installation. Owners and admins see, delete and edit them under Memory and skills in Settings → Slack, and uninstalling deletes them all.

People from other companies in shared Slack Connect channels only see and save notes for the conversation they're in, never workspace-wide ones; skills work for them as usual. Owners and admins can turn notes off with **Let the agent keep notes** (`memory_enabled`, on by default): the agent then gets no note tools and no pins, skills keep working, and the notes already saved are kept for admins to see or delete.
