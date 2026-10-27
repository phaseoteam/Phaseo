---
"@phaseo/web": minor
---

Open a logged request in Chat and continue it. Request details, the request table's right-click menu and a session's details now have an "Open in Chat" action for Chat Completions, Responses and Messages requests whose prompt and response were stored. Chat shows what will be carried over (model, pinned provider, parameters, system prompt, server and function tools, the logged response), then opens a new chat with its own session, saved in the browser. Tool calls, tool results and attachments from the log are sent in their original structure while those messages are unedited, so the conversation continues faithfully, and you can switch models or compare them as in any chat. The link only carries IDs, so any workspace member who can view the request can open it.
