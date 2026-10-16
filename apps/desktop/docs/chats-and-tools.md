# Chats and contextual tools

Chats are the desktop workspace's primary navigation. Each chat can be personal or associated with a project; the bounded history projection carries the optional project ID without returning conversation bodies. Search, pinning, archives and pagination remain available in the single left sidebar.

The centre keeps the selected conversation mounted while opening tools and settings. Message drafts and history position survive those interactions. Accounts, agents, MCP connections and schedules live under Settings; Inbox and the existing Platform surface remain available from the sidebar footer.

General Chat in the Phaseo harness can use enabled global MCP services and services associated with its project. Each tool call needs approval and identifies the service and tool. Chat has no built-in project file or command tools. Failed connection setup preserves queued input; interrupted approvals can resume from saved chat state. Stop affected chats before editing their connections.

MCP document services can provide resources alongside tools or on their own. The Phaseo harness can list resource pages and templates, then read a URI with approval. Responses are limited to 1 MB and catalogue pages to 200 entries.

Prompt services can list their templates and retrieve one with approved arguments. Returned messages remain tool results; they do not change system instructions. A dedicated prompt picker is not available yet.

Files & Git, pull requests, terminal and Browser share a collapsible right panel. Selecting a different chat initializes project tools from its project. Personal chats start without a project. Terminals belong to their chat and project. At narrower widths the tools overlay the conversation and can be dismissed without losing it.

## Native browser

The Browser uses Electron WebContentsView, as T3 Code's browser does. Each browser tab is its own tab in the right pane, titled with the page title (else the host, else "Browser") and the page's icon; there is no tab strip inside the browser. A chat holds up to twenty browser tabs, each with its own native history during the app session. Addresses, titles, device previews, zoom, colours and any name you give a tab are saved locally per chat; a fresh native page restores them. Tabs saved before this change, including their Desktop, Phone and Tablet previews, carry over. Closing a tab disposes its page. A dedicated persistent browser partition stores website sessions separately from the app and provider credentials. Closing the pane hides the page; reopening restores it. App shutdown disposes the pages.

Above the page is one quiet row, after T3 Code's: Back, Forward and Reload (it spins while the page loads; click it to stop), the address bar, then Annotate, Capture and the menu. The address bar is plain text until you hover or focus it; focusing selects the address, Enter opens it, Escape puts the current address back. An address keeps its scheme; a host such as `localhost:5173` opens over http:// and other hosts such as `example.com` over https://; anything else searches DuckDuckGo. Hovering the bar shows **Open in system browser**. A thin bar under the row shows loading progress. **Annotate** lets you click an element on the page: its screenshot and a note naming the element go into your message (Escape cancels). **Capture** copies a screenshot of the page and adds it to your message. The mouse's back and forward buttons navigate the page under the pointer.

The menu (⋮) has Hard reload, Open DevTools, Show device toolbar, Appearance (System, Light or Dark for the page's `prefers-color-scheme`), Mute tab, Downloads, Zoom (25% to 500% in T3 Code's steps) and Clear cookies or Clear cache, which apply to every browser tab. A new tab lists the project's recently used pages (the last fifty per project; eight are shown, each removable) and local web servers that answer on this computer. A page that fails to load shows "This site can't be reached" with the host, the reason in plain words, Details with the error code, and Reload. A page whose renderer crashes reloads quietly, waiting longer after each crash.

Shortcuts, which apply while a page or its address bar has focus and can be changed in Settings: Ctrl+R (⌘R) reloads, Ctrl+L focuses the address bar, and Ctrl+=, Ctrl+- and Ctrl+0 zoom the page instead of the app. App shortcuts such as Ctrl+K and Ctrl+W still work while a page has focus; undo stays with the page.

Remote pages have no preload, Node integration or workspace bridge. HTTP/HTTPS addresses, including local development servers, are supported. File/data/custom protocol navigation and embedded URL credentials are rejected. Main IPC requires the application's own main-frame web contents, including when another native surface belongs to its window. Native surfaces hide for app dialogs and menus, and their bounds follow the host panel and zoom.

HTTP/HTTPS popup links open a new browser tab in the current chat; background-tab requests keep the current tab selected. Inactive native surfaces cannot request popups into another chat. Recording a video of the page, floating the page over the chat and showing an agent's pointer are not available yet: no agent drives this browser today.

Site permissions use a native dialog identifying the requesting origin. Choose **Deny** or **Allow for this page** for notifications, location, microphone/camera, clipboard reads, MIDI, fullscreen, pointer/keyboard capture and idle detection. Decisions last until navigation or reload; camera and microphone grants are separate. Only the visible owned main page can ask. Hiding or minimizing the window, hiding the page, navigating, closing its tab or closing the app cancels pending prompts. Focused visible main pages can use standard clipboard copy buttons. Embedded-frame permissions, persistent site settings and device/file/screen pickers remain in progress.

The permission service implements both [Electron permission handlers](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler). Owned Chromium tests cover notification grant/deny, repeated requests, page reset, minimized-window rejection/cancellation, hiding/closing and cancellation of a real native dialog on navigation. They show no system notifications and access no media, location or clipboard data. Camera/microphone decisions are covered by deterministic policy tests; real devices and additional operating systems remain unverified.

## Verification

`pnpm --filter @phaseo/desktop audit:design` runs the new chat-shell smoke/audit. It uses an isolated local profile, two seeded conversations and a local HTTP site, with no provider inference. It verifies grouping, drafts, settings, project PR/terminal context, native navigation/history, chat-specific browser restoration, unsafe-address rejection, remote privilege isolation, bounds, modal hiding and cleanup.

Source and Windows archive runs produce 16 shell captures across light/dark themes at 1440×920 and 1040×680, plus multiple-tab, phone-preview and downloads captures, two separate native browser page captures and four pull-request-detail captures and a file-review capture. Electron's host `capturePage` does not include the separate WebContentsView pixels; the native page is captured directly and is not composited into the shell screenshot.

The broader source/archive desktop smoke covers existing accounts, agents, MCP, schedules, attachments, Git, worktrees, notifications and native protocol fixtures through the new public navigation. Provider fixtures do not establish signed-in live inference or complete product parity. Multi-OS rendering, scaling and assistive-technology verification remain open.

Tab workflows verify independent native surfaces/history, selection and disposal through the pane's tabs, fresh-surface address restoration and closing the last tab. Renderer reload hides existing native surfaces before the new shell loads. Owned native window.open and Ctrl-click workflows verify foreground/background tab delivery, source-history preservation, unsafe-popup rejection, remote privilege isolation and disposal. Twenty tabs verify the admission limit, readable error and recovery after closing a tab. The audit fails on unexpected unhandled promise rejections. Blank-window/opener-dependent authentication flows remain unverified.


## Developer tools

A browser tab can open Electron’s native detached inspector from the menu (Open DevTools), F12, Ctrl+Shift+I or Cmd+Alt+I. Native open/closed events update the menu. The inspector targets that website web contents; the app renderer is not inspected. Closing the tab disposes its inspector. Owned source/archive workflows verify menu toggling, native Windows keyboard input, external inspector closure, selected-target isolation and disposal. macOS shortcuts and complete developer-tool workflows remain unverified.

## Responsive previews

**Show device toolbar** in the menu shows the page at a fixed size, as T3 Code's device toolbar does: choose Responsive or one of seventeen devices (iPhone SE to Nest Hub Max), type a width × height between 240 and 3840 pixels, lock the aspect ratio, rotate, or drag the edges of the device. The device is scaled down to fit the pane and centred. Close (×) returns the page to the full pane. Each tab saves its device; a fresh page restores it once it opens an address.

Source and Windows archive checks verify actual native page and screen dimensions in both orientations, modal dismissal and panel restoration, and rejection of invalid sizes. These are Chromium viewport previews; physical-device fidelity, touch and device-specific user agents remain unverified.

![Owned loopback page in Phone preview](screenshots/browser-phone-page.png)

## Downloads

Downloads use [Electron’s native save workflow](https://www.electronjs.org/docs/latest/api/download-item) and appear in their originating chat. A Downloads button with the count appears in the browser row while the chat has downloads, and Downloads in the menu always opens the list. The list shows bytes and state, Pause/Resume, Cancel, Show in folder and Remove. Removing a record leaves the saved file intact. Only confirmed native download paths can be revealed. Active transfers continue when the pane is hidden; owner-window shutdown cancels them. The app bounds concurrent transfers to twenty and keeps up to one hundred records, pruning finished entries first. A rejected transfer reports the limit in its record.

Owned source and Windows archive workflows use temporary save destinations, verify exact saved bytes, pause/resume/cancel, chat isolation and removal, and confirm the native page hides behind the downloads list. Five deterministic cases cover progress, completion, owner isolation, action guards, bounds, limit feedback and shutdown. The native save-dialog interaction and operating-system folder UI remain unverified. Download records are stored in the workspace SQLite database and survive app restarts. Unfinished records recover as terminal interruptions; automatic transfer resumption across restarts remains open.

![Downloads](screenshots/browser-downloads.png)

`pnpm --filter @phaseo/desktop test:downloads` runs three separate Electron processes against an isolated profile: download, reopen and remove its record, then reopen again. Source and Windows archive runs verify retained native paths, exact saved bytes and durable removal without deleting the file. SQLite reopening tests cover interrupted-state recovery and a one-hundred-record bound that preserves active transfers. Progress writes are limited to once per second; final states and control changes save immediately. Write failures report that history may not survive a restart, and failed removal retains the visible record. Windows CI repeats both restart audits.

## Pull requests

The Pull requests surface follows T3 Code. In a chat it has two lists, **Linked** and **Open**; without a chat it shows the project's open pull requests.

- **Rows** show the state glyph (open green, draft grey, closed red, merged violet) with a red warning in the corner when the branch conflicts, the number, the title, the checks and review glyphs, added and removed lines, then the author, repository, `head → base` and when it last changed. Hovering a row shows a menu: Copy link, Open, Watch for changes or Stop watching, and Unlink from chat. Open rows can be linked to the chat from their menu.
- **Linked pull requests** belong to the chat and are kept by the app with the chat, so they survive restarts. The footer reads "2 open · 3 linked"; **Link** accepts a GitHub URL, `owner/repo#42`, `#42` or `42` (a bare number uses the chat's project). The list remembers the last state GitHub reported for each one and refreshes it whenever the list or the pull request is opened. **Watch for changes** marks a link with an eye; the app does not yet poll watched pull requests in the background.
- **A pull request** opens with T3's header: the repository and `#N` coloured by state, which condenses to `#N title` as you scroll. The right side holds one main control chosen by state: a Merged or Closed badge, **Resolve conflicts** (opens GitHub's conflict editor), **Ready for review** for drafts, or the merge button in the repository's allowed method (Merge, Squash and merge, Rebase and merge). Merging and closing need a second click: the button turns into "Confirm merge?" and resets after 3 seconds, a click elsewhere, Escape or leaving the window.
- **More** (the dots) has Refresh, Ready for review or Convert to draft, Merge now, the merge method, Open on GitHub, Copy link, Copy PR number, Close or Reopen, and Delete branch once the pull request is closed or merged.
- Below the header: the title (hover for the pencil to rename it), the author, when it was updated, a copyable `gh pr checkout N`, `base ← head`, files changed and lines added and removed. A base branch shown in amber means the branch is behind; its popover offers **Update branch**.
- **Summary** lists reviewers (a green ring means approved, red means changes requested, faded means the verdict predates the latest commits) and labels, then the description, the checks with their status and Details links, and the comments as flat rows with reactions. The comment filter hides bot comments and resolved or dismissed ones by default and remembers your choice. The checks icon in the tab bar opens the checks in a popover.
- **Timeline** is a vertical rail of commits, the opening, reviews and the merge or close, with runs of comments folded into one row. **Newest first** flips the order.
- **Code** shows every changed file as its own diff with T3's toolbar: hide whitespace changes, unified or split, wrap lines, collapse all, and a file tree. Tick **Viewed** on a file to fold it away; ticks are kept on this computer and turn into "Changed" when the file is pushed to again. Review threads sit under their lines with **Reply** and **Resolve** or **Unresolve**.
- The round comment button at the bottom right posts a comment, or submits a review as Comment, Approve or Request changes.

Every write goes through the project's GitHub CLI login in the main process and checks that the pull request has not moved on since you looked; otherwise it refreshes and asks you to try again. Errors appear in a strip under the header, with GitHub's own reason where it gives one. Pull requests from another repository than the chat's project open on GitHub.

Live native tabs now retain their configured viewport when the tools panel remounts, even if an immediate rotate/close leaves older saved metadata. Saved preview settings apply only to a fresh unconfigured surface. Source/archive regression checks reproduce the former portrait reversion and verify both live landscape preservation and fresh phone restoration. `pnpm --filter @phaseo/desktop test:browser-viewport` runs 96 native geometry cases across four device orientations, eight fractional panel sizes and app zoom factors of 1, 1.25 and 1.5; it verifies exact page/screen dimensions, containment and centring. The evidence is written to `output/playwright/browser-viewport/geometry.json` and uploaded by Windows CI. Physical display scaling and other operating systems remain unverified.

## Project instructions

Phaseo project Chats load the project's root `AGENTS.md`. Code and Plan also load directory-scoped `AGENTS.md` files when inspecting files or directories. Edit these files through the existing Files panel. Personal Chats do not load project instructions; native harnesses retain their own discovery rules.

More specific instructions apply to their directory and descendants. Files must be valid UTF-8 text within the registered project, at most 16 KiB each, with up to 32 loaded files and 64 KiB total. Invalid root instructions reject submission and retain queued input. Local writes and commands carry the confirmed instruction revision: changed or newly discovered instructions block execution until the model reviews them and requests a fresh approval. A saved pending approval is restored before continuing after a restart.

Owned model fixtures verify root and folder scopes, approval-time changes, new instruction discovery, commands, persisted approval recovery and actual file effects. Filesystem watchers, native instruction settings and broader skill/plugin management remain in progress.

Settings now includes global instructions for Phaseo Chat, Code and Plan, including personal chats. Guidance lives in the desktop profile's `workspace/instructions/AGENTS.md`, with a 16 KiB UTF-8 text limit. Project and folder guidance take precedence within their scopes. A changed global instruction revision blocks previously approved file writes and commands until the model sees the update and requests a fresh approval. Invalid guidance rejects admission before inference.

The editor preserves drafts after save failures, detects external edits, offers Reload and allows clearing guidance. Nine new tests cover ordering, personal scope, global change/removal, invalid-state atomicity, BOM revisions, edit bounds, concurrent/stale saves and an actual approved file effect. Current desktop suite: 726 tests across 95 files. Source and completed Windows archive settings verification each capture four states across both themes/window sizes and verifies durable file saves, stale-write rejection, retained drafts and reload with zero provider inference. Archive hashes match the current main/preload/renderer build, and Windows CI includes both settings workflows. Signed-in provider execution and native harness instruction editors remain unverified.

![Global instructions](screenshots/global-instructions.png)

## Mentions

Type `@` anywhere in a message to mention a chat or a file. You can also drag a chat from the sidebar onto the composer: its chip goes in where you drop it, or at the caret if you drop it outside the text. Chats appear first, most recent first; in a project, files and folders follow, matched by name first and then by path, from the files Git tracks or would track (ignored files are skipped; outside Git, everything except `.git` and `node_modules`). A choice becomes a chip in the text where you typed it, and Backspace removes it whole. Attached and pasted files land as chips at the caret too. When you send, a file chip reaches the agent as `@path`, a chat chip as a reference it can read with `read_thread` (up to 10 per message), and attachments as attachments.

Messages and replies show the same chips: file paths and `@path` mentions open in your editor, links show the site or the GitHub pull request or issue, and chat mentions open the chat. Code blocks, version numbers, emails and paths inside sentences like `and/or` stay as text.

## Right pane

The pane on the right holds surfaces as tabs, as in T3 Code: Browser, Terminal, Files, Pull requests and Agents. Each chat remembers its own tabs, which one is active and whether the pane is maximised. With nothing open the pane shows **Open a surface**: click a row or press its letter (B, T, F, P, A). The **+** after the tabs opens another surface. Hover a tab and its icon becomes a close button; middle-click also closes it, and right-click offers Close, Close others, Close to the right and Close all. `Ctrl+W` closes the active tab; closing the last one closes the pane. Maximise gives the pane the chat's space until you restore it. Drag the pane's left edge to resize it (360 pixels up to 70% of the window; double-click resets it to 540).

### Changes (diff)

The diff shows every changed file in one scrolling list, as in T3 Code. The menu at the top left picks what to compare:

- **Changes**: the branch against the branch it started from, including uncommitted work and new files. Next to it, the comparison target reads **Automatic** (the remote's default branch, otherwise `main` or `master`) until you search for and pick another local or remote branch.
- **Uncommitted**: everything not yet committed, new files included.
- **Latest turn** and **Turn N**: what one agent turn changed. Phaseo snapshots the project before and after each turn in a Git project (the snapshot never touches your staged files, branches or stash), so a turn's diff stays exact even after later edits. Turns finished before this version, chats outside a Git project and snapshots Git has since cleaned up show no turn diff.

On the right: lines added and removed, **Refresh**, **Collapse all files**, stacked or split layout, line wrapping, **Hide whitespace changes** and the file tree, which lists changed files beside the diff; choosing one scrolls to it. Each file has a sticky header: its chevron (green for new files, red for deleted, amber for changed) folds the file, clicking the name opens the file, and the copy button copies its path. Binary and mode-only changes are listed as a count rather than shown. Click the unchanged-lines bars to expand context; if the file changed meanwhile, **Refresh** brings the diff up to date. The diff refreshes when a turn finishes, when the window regains focus and when you save, stage or commit.

Hover a line number and click **+** to comment on a line or a selected range. A comment is added to the chat as review context (with the quoted lines) and shows under the line with a coloured left rule; delete it from there. `Ctrl+Enter` adds a comment, `Escape` cancels it.

Branch switching, new branches and worktrees, staging, unstaging, commits and **Push** (or **Publish branch** the first time) are in the Git actions, kept apart from the diff. Push never asks for credentials in the app; set up Git credentials first.

### Files

The file explorer lists the project as a tree, loading each folder as you open it. Files Git ignores stay hidden. **Search files** finds files and folders by name or path, and **Expand all folders** opens every folder (very large projects show the first 5,000 entries). Opening a file shows it in its own surface: the path at the top (click a folder to browse its neighbours), **Open in editor**, **Show source**/**Show preview** for Markdown, CSV and TSV (up to 100 rows and 30 columns) and HTML pages (shown without running scripts), word wrap, and the explorer on the right. Images show as pictures and PDFs as their text.

Text files up to 1 MB are edited in place and saved automatically half a second after you stop typing; a dot after the file name marks edits not yet saved. If the file changed on disk since it was opened, the save stops and **Reload from disk** replaces your edits with the current file. Files over 1 MB show their first 1 MB read-only.

### Terminal

A terminal fills its tab, with split side by side, split stacked, new terminal and close in a small cluster at the top right (`Ctrl+D`, `Ctrl+Shift+D`, `Ctrl+N` and `Ctrl+W` while a terminal has focus). A tab holds up to four terminals per split group; with more than one terminal, a list on the right switches between them. A terminal closes when its process exits. A chat's terminals can also open in a drawer under the chat (280 pixels tall by default, 180 pixels up to three quarters of the window; drag its top edge to resize).

## Code chats: settle and snooze

Code lists chats from every project in one list, as T3 Code does; the menu above it narrows the list to one project. Each card shows its project, the title, and its branch, tags and model. The right of the card says what the chat needs: Approval, Input, Working with a live timer, Waiting, Failed, Limited, Woke, or Done for a finished turn you have not opened since; otherwise how long ago you last wrote.

- **Settle** a chat when you are done with it: hover its card and choose Settle, press `Ctrl+Shift+S` (`⌘⇧S` on macOS) in the open chat, or use its menu. It moves to **Settled** at the bottom of the sidebar and the next chat opens. A chat that is running, waiting on an approval or question, or has a queued message cannot settle yet.
- **Snooze** hides a chat until a time: in an hour, in three hours, this evening, tomorrow at 9:00, next Monday at 9:00, or a custom time. It returns early if it needs you, fails or finishes a turn, marked **Woke**.
- Sending a message un-settles and wakes a chat; pinning does too. `Ctrl+Z` undoes the last settle, snooze, unpin or archive for five seconds after it.
- Code chats with no activity for three days settle on their own; change or turn this off under **Settings → General → Auto-settle inactive chats**, or per chat under **Auto-settle behaviour** in its menu. Un-settling a chat holds off auto-settle until something new happens in it.
- Drag a card to reorder it; dropping it among the pinned chats pins it, among the others unpins it, and onto the Settled heading settles it. Ctrl-click (⌘-click on macOS) picks several chats and Shift-click a range; right-click a picked chat to unpin, settle, snooze, mark unread, archive or delete them together. Esc clears the selection. `Ctrl+1`…`9` open the first nine chats (hold Ctrl to see their numbers) and `Ctrl+Shift+[` / `]` step through them.
- Agents can settle, un-settle, snooze and wake chats too (`organize_thread`); a chat that settles itself does so when its current turn completes.
- Right-click a card for its menu: pin, settle, snooze, tags, mark unread, filter by project, auto-settle behaviour, copy path, branch or chat ID, and archive. Under the last message, a settled or snoozed chat says so, with the way back.

## Questions from the agent

When an agent needs a decision it asks above the composer, one question at a time, as in T3 Code: the header and question, then each option as a row with its number. Press a number (1–9) or click to choose; a single choice moves to the next question by itself, and multiple choice toggles. The last row takes your own answer instead. Arrow keys move, Space toggles, Enter goes on, `Ctrl+Enter` submits from anywhere and Esc folds the panel away. Previous goes back. Dismiss (×) tells the agent you would rather not answer; it carries on without the answers. Answered or dismissed questions stay in the conversation, with secret answers hidden. Claude can ask in Chat as well as Code, and Phaseo models ask with the same shape as Claude: up to four questions with two to four described options each.

While a question is open, the composer answers it, as in T3 Code: its placeholder reads "Type your own answer, or leave this blank to use the selected option", Enter sends what you typed as your own answer to the current question (or, when blank, goes on with the option you chose), and attachments cannot be sent as an answer. Your own answer can also be typed in the panel's last row.

Some questions need a particular kind of answer. The panel then shows the matching field: several lines of text (with the agent's starting text already filled in, which you may edit or clear), a number with its limits, a date, a date and time, an email address or a web address. The answer is checked before it can be sent, and the reason shows under the field. Optional questions can be sent empty. When a server or agent other than the chat's model is asking, the header names it ("from GitHub").

How each agent asks:

- **Claude Code**: AskUserQuestion, with option previews in Markdown under the chosen option. Claude Code still asks for AskUserQuestion and ExitPlanMode when the chat has full access: both tools require user interaction, and Claude Code checks that before applying `bypassPermissions` (checked in Claude Code 2.1.300; the Agent SDK's generic warning that `canUseTool` is skipped in that mode does not apply to them), so no extra hook is needed. MCP servers that Claude talks to can ask too (see MCP below).
- **Codex**: request_user_input, with Codex's own-answer and secret flags. Questions Codex attaches to a message for later stay in the panel after the turn ends and are answered by message: your answer is sent as your next message (steered into the turn if it is still running), headed by each question. Dismissing one sends nothing.
- **OpenCode**: forms made only of text and multiple-choice fields (what OpenCode's question tool asks) appear in the panel; you can add your own answer where the field allows it. Dismissing cancels the form. Forms with numbers, yes or no, links or conditional fields keep the full form card, and so does any answer OpenCode rejects, with its reason.
- **MCP servers** (through Claude Code or Codex) and **ACP agents**: form requests made of text, number, yes or no and choice fields appear in the panel; choices become options, yes or no becomes Yes and No, and other fields get the typed field above. Dismissing cancels the request; the full form card (with Decline and Cancel) is used for links, hidden or conditional fields, or an answer the form rejects. ACP agents are told Phaseo handles form requests, not web-address ones, which Phaseo does not open. Codex's requests to approve an MCP tool call appear as approvals instead.
- **Pi**: extension dialogs. A choice lists its options. A text box can be left empty (Submit empty value sends empty text, which is not the same as dismissing). An editor opens in several lines with the extension's text filled in.
- **Cursor**: Cursor has no question tool, so Phaseo offers `ask_user` (the same shape as Claude's) on the orchestration server Cursor already loads. Cursor's MCP client fails a tool call after 60 seconds (its MCP client passes no longer timeout), so a question still open after 50 seconds turns into one answered by message: the tool tells Cursor the answer will arrive later, the question stays in the panel, and your answer is sent as a message.
- **Grok and other ACP agents**: their own question requests, as before.

### Proposed plans

When Claude Code (in Plan mode) or Grok (in Code mode) finishes a plan, it appears as a plan card in the conversation instead of an approval: the plan in Markdown under a left rule, folded with Expand plan when long, with a copy button. Implement lets the agent go ahead (and turns Plan mode off for the chat). Revise opens a box for what should change; Send revision returns it to the agent, which revises the plan and proposes it again. A plan waits for you even with full access. Decided plans stay in the conversation with what you chose, and any revision you asked for.

### Lasting approvals

Where an agent offers a lasting choice, the approval card adds it next to Allow and Deny: Always allow (ACP agents' allow-always option, or an MCP tool approval Codex lets you keep for the session or for good) and Always deny (ACP agents' reject-always option). Hover the button for the agent's own wording.

## Tags and navigation

Tag a chat from its header (Add tag, or + next to its tags) or from Tags in its sidebar menu: type to find a tag or create one with Enter. A chat has up to 8 tags of up to 24 characters; each tag keeps one colour everywhere. In Chat, the tags in use sit above the chat list: pick one to show only chats with it, and pick it again to show everything. Sidebar rows show up to three tag dots. Agents tag their own chat with `organize_thread` (action `tag`) once the topic is clear, reusing tags already in use and keeping yours.

A conversation with three or more questions that does not fit on screen shows the same navigation rail as the web chat on its left edge: one mark per question, the current one bright. Hover to preview the question and the start of its answer, and click to jump there.

Drag the sidebar's right edge to resize it (200–480 pixels; double-click to reset, or focus the edge and use the arrow keys).

## Scheduled tasks

**Scheduled tasks**, under New chat at the top of the sidebar, lists chats that start themselves while Phaseo is open: at a time of day (every day, or on chosen days, in this computer's timezone) or every few minutes or hours. Each one runs like a chat you pick, with that chat's account, agent, model, project and permissions, and every run is a fresh chat listed under the task. New ones start paused; the switch turns them on, and Run now starts one immediately. Missed runs are skipped. Agents can schedule tasks from a chat with `schedule_task`, and those start turned on.

## Reusable chat commands

Type `/` at the start of a message to open the command menu. It starts with actions for the chat: archive, compact, fork, export, attach files, rename, pin, start a new chat, open MCP or account settings, switch the model, and change the model's own settings (Reasoning and the like, with Fast as a toggle). Code chats add plan mode and permissions. Actions with choices open them in the menu; Escape goes back. Plan mode has no button of its own: the composer shows a Plan indicator only while it is on, and clicking it turns it off. The model, reasoning and permissions controls sit on the left of the composer.

After the actions, the menu lists saved prompts, then the agent's own commands and skills (Claude Code, Codex, OpenCode, Pi and Phaseo skills), then the chat's MCP prompts. Arrow keys move, Enter or Tab chooses and Escape closes it. A new chat lists the chosen agent's commands before the chat exists; comparing several models offers saved prompts only.

- A saved prompt without arguments replaces the draft with its text. One that takes arguments leaves `/name ` in the draft, and the arguments typed after it are filled in when you send.
- A native command or skill leaves `/name ` for its arguments. It only runs natively when chosen from the menu; typing the same text sends it as plain text.
- An MCP prompt with arguments asks for them in the menu, then inserts the prompt's text and any images.

Saved prompts can belong to **All chats** or **This project**, which the menu labels. Create or edit one as a Markdown file. Global commands live in the desktop profile's `commands` directory, and project commands in `.phaseo/commands`. Files use a lowercase name with letters, numbers and hyphens, and Markdown with optional YAML `description` frontmatter:

```md
---
description: Review a change
---
Review $1 against $2 and explain your findings.
```

`$ARGUMENTS` inserts all supplied text. Numbered arguments accept quoted phrases; the last numbered placeholder receives the remaining arguments. Templates without placeholders append the supplied arguments. Preview reloads the file; editing uses its confirmed hash to reject an external change. Invalid command files remain visible as diagnostics while valid commands are available. Files are limited to 16 KiB, catalogs to 200 commands, and expansion to the composer's message limit. Template expansion does not execute shell code or alter harness, model or permission settings.

For OpenCode chats, the same dialog has an OpenCode catalog of registered commands and skills. Select an action and enter arguments to prepare an explicit draft; Send or Queue submits it. Commands require approval before native execution, and native tool permissions still apply. Skills activate through the native skill API before submitting their task. Changing the draft prefix clears native execution intent; queued argument edits retain it. Catalogs use the same personal-chat or project directory as execution. Other harness catalogs, Phaseo skills, nested saved command names, advanced frontmatter, deletion/import and plugin management remain in progress.

Current verification: 669 tests / 90 files; source and Windows archive command workflows each capture 13 states across both themes/window sizes. They verify keyboard selection, draft/focus preservation, scope, UI creation, stale edit rejection and native browser hide/restore, with zero submissions or provider inference.

![Command preview](screenshots/prompt-command-preview.png)

OpenCode native actions add fourteen deterministic cases for catalog scope/metadata, explicit identities, argument edits, queue persistence/rejection, command approval/catalog changes, skill ordering and durable output reconciliation. Current verification: 683 tests / 91 files. Source and completed Windows archive picker workflows each capture 18 states, preserve drafts across chat switches, verify native browser hide/restore and make zero native submissions or provider inference calls. Command execution is covered by owned protocol fixtures; signed-in native execution remains unverified.

![Native action picker](screenshots/native-action-picker.png)

Pi chats now expose their native extension commands, prompt templates and skills in the same Commands dialog. Discovery uses the exact execution directory through get_commands, without sending a prompt or persisting a discovery session. Interactive-only Pi commands are unavailable through RPC and do not appear. Selecting an action preserves explicit draft/queue intent; running it requires approval and a fresh catalog check afterward. Pi owns the action effects and its configured tool policies. Decline, cancellation and unavailable catalogs before submission retain the input; a failure after native submission does not imply safe retry. Skills use the registered skill:name identity through the native prompt path.

Pi validation adds twelve deterministic cases for catalog metadata, identity/source bounds, ambiguity, owned discovery cleanup/cancellation, command/skill dispatch and approval-time removal/decline/cancellation. Current desktop suite: 695 tests / 92 files. Source and completed Windows archive workflows each capture 18 picker states, execute two owned native RPC prompts, verify an approved actual file effect and both replies, retain queued input on catalog removal, and verify all owned child processes stop. OpenCode picker regressions also pass. These fixtures use zero provider inference; an installed signed-in Pi engine and extension/plugin-specific side effects remain unverified.

![Pi native action picker](screenshots/pi-native-action-picker.png)

Claude chats offer registered commands and skills in the same composer dialog, including aliases and argument hints. Discovery uses the selected account profile and exact chat directory without submitting input or persisting a session. Native actions require approval and a fresh catalog check before their slash prompt is released. Unavailable actions retain queued input; local command output appears in activity alongside assistant replies.

Claude validation adds fourteen deterministic cases, bringing the desktop suite to 709 tests across 93 files. Source and completed Windows archive workflows each verify 18 picker states, selected-profile isolation, three owned SDK prompts, approved file effects, aliases, local output and child-process cleanup. Archive hashes match the current build, and OpenCode/Pi source regressions pass. Windows CI includes both Claude workflows. An installed Claude CLI catalog check independently discovers a project command with zero inference requests. Owned execution fixtures do not prove signed-in provider inference or arbitrary plugin behavior.

![Claude native action picker](screenshots/claude-native-action-picker.png)

OpenAI chats now offer native skills in the existing Commands dialog. Catalog discovery uses the selected isolated account profile and exact chat directory without starting a thread or turn. Disabled skills are excluded; native loading errors remain visible. Selection keeps the native file identity in the draft and queue. Execution checks availability before and after approval, then sends structured skill input with the task arguments and attachments. Ordinary slash text does not activate a skill. Native OpenAI commands are unavailable through this catalog.

Eight new tests cover scope/identity bounds, selected-profile isolation, owned discovery cancellation/cleanup, fresh approval checks, structured input and removed-skill admission. The desktop suite passes 717 tests across 94 files, plus typecheck, lint and build. The installed native CLI independently discovers an owned project skill without a turn submission. Source and completed Windows archive picker verification each cover project/personal scope and explicit draft preparation in four captures across both themes and window sizes. Archive hashes match the build; Claude source regressions pass. Windows CI includes the pinned native catalog and both picker workflows. Native skill execution is covered by owned protocol fixtures; signed-in inference remains unverified. Skill list rows preserve spacing and show two description lines, with the complete description available on selection.

Claude catalog lifecycle follow-up: source and Windows archive bridge audits stall native initialization for the real 15-second deadline. Concurrent sign-in, account status, harness update and duplicate catalog reads reject before side effects. Timeout stops both owned relay/SDK child processes, releases guards and allows a fresh successful catalog read. No additional user prompts or provider inference occur. T3 nightly 2648 remains the latest published release on recheck.

![OpenAI native skill picker](screenshots/openai-native-skill-picker.png)

All native catalogs share keyboard navigation: arrows cycle results, Home/End select the first/last result, and Enter opens its arguments. Search and argument fields receive focus on entry and Back. IME composition keeps Enter for text entry. The search exposes its active option to assistive technology, distinguishes an empty catalog from no matching results, and clears stale choices while refreshing or after discovery failure.

## MCP prompts

Open **Commands → MCP prompts** in any chat to browse enabled global services and services associated with that chat’s project. Search or use the arrow keys, Home/End and Enter to select a prompt. Enter its arguments, then choose **Load prompt** to review the resolved text. **Insert into chat** appends the text to the current draft; Send remains a separate action. Changing an argument requires reloading before insertion.

Assistant examples retain explicit role labels in the editable draft. PNG, JPEG, GIF and WebP prompts display image previews and insert durable attachments alongside ordered image markers. Embedded text resources remain labelled source material in the draft. Invalid image bytes or MIME mismatches reject insertion and preserve the draft. Audio, binary resources and resource links remain inspectable but cannot yet be inserted. Closing the dialog cancels its pending service request. Failed discovery can be retried with Refresh; discovery is currently all-or-nothing across enabled services. This picker does not handle server elicitation; approved in-chat MCP calls support interactive forms. Authentication, audio/binary-resource insertion and resource subscriptions remain in progress.

The same MCP prompt chooser works with configured HTTP services. Owned source/archive checks cover global/project isolation, pages, text and image previews, explicit insertion, failure/retry, cancellation and session termination. These checks use the installed SDK’s 2025-11-25 handshake/session transport; Approved in-chat HTTP prompt retrieval and resource reads also pass source/archive Chat, Code and Plan checks, including server-requested forms, denial, cancellation and all three session terminations. Newer protocol revisions, authenticated HTTP services and resource subscriptions remain separate validation work.

Assistant file links retain their descriptive labels. A complete local-file destination missing its closing angle bracket is corrected for display; original chat text stays unchanged. Code, HTML, directives, remote URLs and incomplete destinations remain literal. Project file actions use the existing editor bridge and show pending/error feedback; personal-chat file references remain inert.

